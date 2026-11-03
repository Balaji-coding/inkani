require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const fs = require('fs/promises');
const mongoose = require('mongoose');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const path = require('path');
const Customer = require('./models/Customer');
const LoyaltySettings = require('./models/LoyaltySettings');
const Product = require('./models/Product');

const app = express();
const PORT = Number(process.env.PORT) || 10000;
const CASHIER_PIN = process.env.CASHIER_PIN;
const DEFAULT_SHOP_ADDRESS = 'Teppakulam, Madurai, Tamil Nadu 625009';
const DEFAULT_SHOP_MAPS_URL = 'https://www.google.com/maps/place/9%C2%B054\'42.2%22N+78%C2%B008\'53.1%22E/@9.9117149,78.1471646,18z/data=!3m1!4b1!4m13!1m8!3m7!1s0x3b00c50726b72ae3:0xe013610ff6d4b0d6!2sTeppakulam,+Madurai,+Tamil+Nadu+625009!3b1!8m2!3d9.9114761!4d78.1498516!16s%2Fg%2F11gjw_8qy3!3m3!8m2!3d9.911713!4d78.148075?entry=ttu&g_ep=EgoyMDI2MTAyMC4wIKXMDSoASAFQAw%3D%3D';
const cloudinaryCredentials = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.cloudinary_cloud_name,
  api_key: process.env.CLOUDINARY_API_KEY || process.env.cloudinary_api_key,
  api_secret: process.env.CLOUDINARY_API_SECRET || process.env.cloudinary_api_secret
};
const cloudinaryConfigured = Object.values(cloudinaryCredentials).every(Boolean);
if (cloudinaryConfigured) cloudinary.config(cloudinaryCredentials);
const MAX_PRODUCT_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_LEGACY_PRODUCT_BODY_SIZE = '15mb';
const DEFAULT_PRODUCTS = [{
  id: 'custard-fruit-salad',
  name: 'Custard Fruit Salad',
  price: 60,
  description: 'payaya+pinapple+banana+apple+custard cream+dates +tooty fruity included net weight 250g',
  imagePath: '/asserts/custard-fruit-salad.png',
  available: true
}];

const uploadDirectory = path.join(__dirname, 'public', 'uploads');
const productJsonParser = express.json({ limit: MAX_LEGACY_PRODUCT_BODY_SIZE });
const defaultJsonParser = express.json({ limit: '10kb' });
const supportedImageTypes = ['image/png', 'image/jpeg', 'image/webp'];
const productImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PRODUCT_IMAGE_SIZE, files: 1 },
  fileFilter(req, file, callback) {
    if (!supportedImageTypes.includes(file.mimetype)) {
      return callback(new Error('Upload a PNG, JPEG, or WebP image.'));
    }
    return callback(null, true);
  }
}).single('image');
app.use((req, res, next) => {
  const isProductSave = ['POST', 'PUT'].includes(req.method)
    && /^\/api\/cashier\/products(?:\/[^/]+)?$/.test(req.path);
  return (isProductSave ? productJsonParser : defaultJsonParser)(req, res, next);
});
app.get('/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  return res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? 'ok' : 'unavailable',
    database: databaseConnected ? 'connected' : 'disconnected'
  });
});
app.use(express.static(path.join(__dirname, 'public')));

function normalizePhone(value) {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  const phone = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits;
  return /^\d{10}$/.test(phone) ? phone : null;
}

function requireCashierPin(req, res, next) {
  const bodyPin = typeof req.body?.pin === 'string' ? req.body.pin : '';
  const headerPin = typeof req.get('x-cashier-pin') === 'string' ? req.get('x-cashier-pin') : '';
  if (!CASHIER_PIN || (bodyPin !== CASHIER_PIN && headerPin !== CASHIER_PIN)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Cashier PIN' });
  }
  return next();
}

function receiveProductImage(req, res, next) {
  productImageUpload(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Image must be no larger than 10 MB.'
      : error.message || 'Could not receive the selected image.';
    return res.status(400).json({ error: message });
  });
}

function getLegacyProducts(settings) {
  if (Array.isArray(settings?.products) && settings.products.length) {
    return settings.products.map((product) => (
      product.id === 'custard-fruit-salad' && !product.imagePath
        ? { ...product, imagePath: DEFAULT_PRODUCTS[0].imagePath }
        : product
    ));
  }
  return [{
    ...DEFAULT_PRODUCTS[0],
    available: settings?.custardFruitSaladAvailable ?? true
  }];
}

let productMigrationPromise = null;

async function migrateLegacyProductImage(imagePath) {
  if (!imagePath) return '';
  if (/^\/uploads\/product-[\da-f-]+\.(?:png|jpe?g|webp)$/.test(imagePath)) {
    try {
      await fs.access(path.join(__dirname, 'public', imagePath.slice(1)));
      return imagePath;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return '';
    }
  }
  const imageIdMatch = imagePath.match(/^\/api\/product-images\/([a-f\d]{24})$/i);
  if (!imageIdMatch) {
    return imagePath === '/asserts/custard-fruit-salad.png'
      ? imagePath
      : '';
  }

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'productImages' });
  const imageId = new mongoose.Types.ObjectId(imageIdMatch[1]);
  const [file] = await bucket.find({ _id: imageId }).limit(1).toArray();
  if (!file) return '';
  const contentType = file.metadata?.contentType;
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
  const extension = extensions[contentType];
  if (!extension) return '';

  const chunks = [];
  for await (const chunk of bucket.openDownloadStream(imageId)) {
    chunks.push(chunk);
  }
  const imageBuffer = Buffer.concat(chunks);
  if (!imageBuffer.length || imageBuffer.length > MAX_PRODUCT_IMAGE_SIZE) return '';
  return writeProductImageFile(imageBuffer, extension);
}

async function ensureProductCollectionSeeded() {
  if (!productMigrationPromise) {
    productMigrationPromise = (async () => {
      const settings = await LoyaltySettings.collection.findOne({ _id: 'storefront' });
      if (settings?.productCatalogMigrated) return;
      const hasProducts = Boolean(await Product.exists({}));
      const hasLegacyProducts = Array.isArray(settings?.products);
      const legacyProducts = Array.isArray(settings?.products) && settings.products.length
        ? settings.products
        : hasProducts ? [] : getLegacyProducts(settings);
      for (const product of legacyProducts) {
        const id = typeof product.id === 'string' && product.id
          ? product.id
          : new mongoose.Types.ObjectId().toString();
        if (await Product.exists({ id })) continue;
        const imagePath = await migrateLegacyProductImage(product.imagePath)
          || (id === 'custard-fruit-salad' ? DEFAULT_PRODUCTS[0].imagePath : '');
        await Product.updateOne(
          { id },
          { $setOnInsert: {
              id,
              name: product.name,
              price: product.price,
              description: product.description || '',
              imagePath,
              available: product.available ?? settings?.custardFruitSaladAvailable ?? true
            } },
          { upsert: true, runValidators: true }
        );
      }
      await LoyaltySettings.collection.updateOne(
        { _id: 'storefront' },
        {
          $set: { productCatalogMigrated: true },
          ...(hasLegacyProducts ? { $unset: { products: '' } } : {})
        },
        { upsert: true }
      );
    })().finally(() => {
      productMigrationPromise = null;
    });
  }
  await productMigrationPromise;
}

async function loadStorefrontProducts() {
  await ensureProductCollectionSeeded();
  return Product.find().sort({ createdAt: 1, _id: 1 }).lean();
}

function validateProductInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Enter valid product details.' };
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (body.description !== undefined && typeof body.description !== 'string') {
    return { error: 'Product description must be text.' };
  }
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (body.offer !== undefined && typeof body.offer !== 'string') {
    return { error: 'Product offer must be text.' };
  }
  const offer = typeof body.offer === 'string' ? body.offer.trim() : '';
  const price = typeof body.price === 'number' || typeof body.price === 'string'
    ? Number(body.price)
    : Number.NaN;
  if (!name || name.length > 80) {
    return { error: 'Product name is required and must be 80 characters or fewer.' };
  }
  if ((typeof body.price === 'string' && !body.price.trim())
    || !Number.isFinite(price) || price < 0 || price > 100000) {
    return { error: 'Enter a product price between 0 and 100000.' };
  }
  if (description.length > 500) {
    return { error: 'Product description must be 500 characters or fewer.' };
  }
  if (offer.length > 40) {
    return { error: 'Product offer must be 40 characters or fewer.' };
  }
  if (body.available !== undefined && ![true, false, 'true', 'false'].includes(body.available)) {
    return { error: 'Choose whether the product is available.' };
  }
  const imagePath = typeof body.imagePath === 'string' ? body.imagePath : '';
  if (imagePath && !(
    imagePath === '/asserts/custard-fruit-salad.png'
    || /^\/uploads\/product-[\da-f-]+\.(?:png|jpe?g|webp)$/.test(imagePath)
    || /^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/image\/upload\/[^\s?#]+$/.test(imagePath)
  )) {
    return { error: 'Choose a valid product image.' };
  }
  return {
    product: {
      name,
      price,
      description,
      offer,
      imagePath,
      available: body.available === undefined ? true : body.available === true || body.available === 'true'
    }
  };
}

function isValidImageBuffer(buffer, mimetype) {
  return mimetype === 'image/png'
    ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mimetype === 'image/jpeg'
      ? buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
      : buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP';
}

function uploadImageToCloudinary(buffer) {
  if (!cloudinaryConfigured) {
    const error = new Error('Image uploads are unavailable. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
    error.statusCode = 503;
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'inkani_products', resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        if (!result?.secure_url || !result.public_id) {
          return reject(new Error('Cloudinary did not return a secure image URL.'));
        }
        return resolve({ imagePath: result.secure_url, imagePublicId: result.public_id });
      }
    );
    uploadStream.end(buffer);
  });
}

async function saveLegacyProductImage(imageData) {
  if (imageData === undefined || imageData === null || imageData === '') return null;
  if (typeof imageData !== 'string') return { error: 'Choose a valid image file.' };
  const match = imageData.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z\d+/]+={0,2})$/);
  if (!match) return { error: 'Upload a PNG, JPEG, or WebP image.' };
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_PRODUCT_IMAGE_SIZE || buffer.toString('base64') !== match[2]) {
    return { error: 'Image must be no larger than 10 MB.' };
  }
  if (!isValidImageBuffer(buffer, match[1])) {
    return { error: 'The selected file is not a valid image.' };
  }
  return uploadImageToCloudinary(buffer);
}

async function saveRequestProductImage(req) {
  if (req.file) {
    if (!isValidImageBuffer(req.file.buffer, req.file.mimetype)) {
      return { error: 'The selected file is not a valid image.' };
    }
    return uploadImageToCloudinary(req.file.buffer);
  }
  return saveLegacyProductImage(req.body?.imageData);
}

async function writeProductImageFile(buffer, extension) {
  const filename = `product-${crypto.randomUUID()}.${extension}`;
  await fs.mkdir(uploadDirectory, { recursive: true });
  await fs.writeFile(path.join(uploadDirectory, filename), buffer, { flag: 'wx' });
  return `/uploads/${filename}`;
}

function cloudinaryPublicIdFromUrl(imagePath) {
  try {
    const url = new URL(imagePath);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com') return '';
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 5 || parts[1] !== 'image' || parts[2] !== 'upload') return '';
    const versionIndex = parts.findIndex((part, index) => index > 2 && /^v\d+$/.test(part));
    const publicIdParts = parts.slice(versionIndex >= 0 ? versionIndex + 1 : 3);
    if (!publicIdParts.length) return '';
    publicIdParts[publicIdParts.length - 1] = publicIdParts[publicIdParts.length - 1].replace(/\.[^.]+$/, '');
    return publicIdParts.join('/');
  } catch {
    return '';
  }
}

async function removeUploadedProductImage(imagePath, imagePublicId = '') {
  if (imagePublicId || cloudinaryPublicIdFromUrl(imagePath)) {
    const publicId = imagePublicId || cloudinaryPublicIdFromUrl(imagePath);
    try {
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
      if (result.result !== 'ok' && result.result !== 'not found') {
        console.error('Cloudinary did not confirm product image deletion:', result.result);
      }
    } catch (error) {
      console.error('Unable to remove product image from Cloudinary:', error.message);
    }
    return;
  }
  if (!imagePath || !/^\/uploads\/product-[\da-f-]+\.(?:png|jpe?g|webp)$/.test(imagePath)) return;
  try {
    await fs.unlink(path.join(__dirname, 'public', 'uploads', path.basename(imagePath)));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Unable to remove product image:', error);
  }
}

function isGoogleMapsUrl(value) {
  try {
    const url = new URL(value);
    const isGoogleHost = url.hostname === 'google.com' || url.hostname.endsWith('.google.com');
    const isShortMapsHost = url.hostname === 'maps.app.goo.gl' || url.hostname === 'goo.gl';
    return url.protocol === 'https:'
      && !url.username
      && !url.password
      && ((isGoogleHost && url.pathname.startsWith('/maps'))
        || (isShortMapsHost && (url.hostname === 'maps.app.goo.gl' || url.pathname.startsWith('/maps'))));
  } catch {
    return false;
  }
}

app.get('/api/store-location', async (req, res, next) => {
  try {
    const settings = await LoyaltySettings.findById('storefront').lean();
    return res.json({
      address: settings?.shopAddress || DEFAULT_SHOP_ADDRESS,
      mapsUrl: settings?.shopMapsUrl || DEFAULT_SHOP_MAPS_URL
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/cashier/store-location', requireCashierPin, async (req, res, next) => {
  const { address: inputAddress, mapsUrl: inputMapsUrl } = req.body;
  const address = typeof inputAddress === 'string' ? inputAddress.trim() : '';
  const mapsUrl = typeof inputMapsUrl === 'string' ? inputMapsUrl.trim() : '';
  if (!address || address.length > 180) {
    return res.status(400).json({ error: 'Enter a shop address between 1 and 180 characters.' });
  }
  if (!isGoogleMapsUrl(mapsUrl) || mapsUrl.length > 2000) {
    return res.status(400).json({ error: 'Enter a valid HTTPS Google Maps link.' });
  }

  try {
    const settings = await LoyaltySettings.findByIdAndUpdate(
      'storefront',
      { $set: { shopAddress: address, shopMapsUrl: mapsUrl } },
      { new: true, upsert: true, setDefaultsOnInsert: true, lean: true, runValidators: true }
    );
    return res.json({
      success: true,
      address: settings.shopAddress,
      mapsUrl: settings.shopMapsUrl
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/products/custard-fruit-salad', async (req, res, next) => {
  try {
    const products = await loadStorefrontProducts();
    const custardProduct = products.find((product) => product.id === 'custard-fruit-salad');
    return res.json({ available: custardProduct?.available ?? true });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/product-images/:id', async (req, res, next) => {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(404).end();
  }
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'productImages' });
    const imageId = new mongoose.Types.ObjectId(req.params.id);
    const [file] = await bucket.find({ _id: imageId }).limit(1).toArray();
    if (!file) return res.status(404).end();
    const contentType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.metadata?.contentType)
      ? file.metadata.contentType
      : 'application/octet-stream';
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    const downloadStream = bucket.openDownloadStream(imageId);
    downloadStream.once('error', next);
    return downloadStream.pipe(res);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/products', async (req, res, next) => {
  try {
    const products = await loadStorefrontProducts();
    return res.json({ products });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/cashier/products', requireCashierPin, receiveProductImage, async (req, res, next) => {
  const validation = validateProductInput(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  let uploadedImage;
  let uploadedImagePublicId;
  let productSaved = false;
  try {
    await ensureProductCollectionSeeded();
    const image = await saveRequestProductImage(req);
    if (image?.error) return res.status(400).json({ error: image.error });
    uploadedImage = image?.imagePath;
    uploadedImagePublicId = image?.imagePublicId;
    const product = {
      id: new mongoose.Types.ObjectId().toString(),
      ...validation.product,
      imagePath: uploadedImage || validation.product.imagePath || '',
      imagePublicId: uploadedImagePublicId || ''
    };
    const savedProduct = await Product.create(product);
    productSaved = true;
    const products = await loadStorefrontProducts();
    const responseProduct = savedProduct.toObject();
    delete responseProduct.imagePublicId;
    return res.status(201).json({ success: true, product: responseProduct, products });
  } catch (error) {
    if (!productSaved && uploadedImage) {
      await removeUploadedProductImage(uploadedImage, uploadedImagePublicId);
    }
    return next(error);
  }
});

app.put('/api/cashier/products/:id', requireCashierPin, receiveProductImage, async (req, res, next) => {
  if (req.params.id !== 'custard-fruit-salad' && !/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Choose a valid product to edit.' });
  }
  const validation = validateProductInput(req.body);
  if (validation.error) {
    return res.status(400).json({ error: validation.error });
  }

  let uploadedImage;
  let uploadedImagePublicId;
  let productSaved = false;
  try {
    await ensureProductCollectionSeeded();
    const currentProduct = await Product.findOne({ id: req.params.id }).select('+imagePublicId').lean();
    if (!currentProduct) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    const image = await saveRequestProductImage(req);
    if (image?.error) return res.status(400).json({ error: image.error });
    uploadedImage = image?.imagePath;
    uploadedImagePublicId = image?.imagePublicId;
    const previousImagePath = currentProduct.imagePath || '';
    const previousImagePublicId = currentProduct.imagePublicId || '';
    const retainedImagePath = validation.product.imagePath || previousImagePath;
    const retainedImagePublicId = retainedImagePath === previousImagePath
      ? previousImagePublicId
      : cloudinaryPublicIdFromUrl(retainedImagePath);
    const savedProduct = await Product.findOneAndUpdate(
      { id: req.params.id },
      {
        $set: {
          ...validation.product,
          imagePath: uploadedImage || retainedImagePath,
          imagePublicId: uploadedImagePublicId || retainedImagePublicId
        }
      },
      { new: true, runValidators: true, lean: true }
    );
    if (!savedProduct) throw new Error('Updated product was not returned from MongoDB.');
    productSaved = true;
    if (uploadedImage && previousImagePath !== uploadedImage) {
      await removeUploadedProductImage(previousImagePath, previousImagePublicId);
    }
    const products = await loadStorefrontProducts();
    return res.json({ success: true, product: savedProduct, products });
  } catch (error) {
    if (!productSaved && uploadedImage) {
      await removeUploadedProductImage(uploadedImage, uploadedImagePublicId);
    }
    return next(error);
  }
});

app.delete('/api/cashier/products/:id', requireCashierPin, async (req, res, next) => {
  if (req.params.id !== 'custard-fruit-salad' && !/^[a-f\d]{24}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Choose a valid product to delete.' });
  }
  try {
    await ensureProductCollectionSeeded();
    const product = await Product.findOneAndDelete({ id: req.params.id }).select('+imagePublicId').lean();
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    await removeUploadedProductImage(product.imagePath, product.imagePublicId);
    const products = await loadStorefrontProducts();
    return res.json({ success: true, products });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/cashier/product-availability', requireCashierPin, async (req, res, next) => {
  const { available } = req.body;
  if (typeof available !== 'boolean') {
    return res.status(400).json({ error: 'Choose whether the product is in stock.' });
  }

  try {
    await ensureProductCollectionSeeded();
    const product = await Product.findOneAndUpdate(
      { id: 'custard-fruit-salad' },
      { $set: { available } },
      { new: true, runValidators: true, lean: true }
    );
    if (!product) return res.status(404).json({ error: 'Custard Fruit Salad product not found.' });
    return res.json({ success: true, available: product.available });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/cashier/verify-customer', requireCashierPin, async (req, res, next) => {
  const { phone: inputPhone } = req.body;
  const phone = normalizePhone(inputPhone);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }

  try {
    const customer = await Customer.findOne({ phone }).lean();
    if (!customer) {
      return res.status(404).json({ message: 'No rewards profile found for this number.' });
    }
    return res.json({
      phone: customer.phone,
      name: customer.name,
      activePoints: customer.activePoints,
      rewardsAvailable: customer.rewardsAvailable,
      totalLifetimeVisits: customer.totalLifetimeVisits,
      walletOpens: customer.walletOpens || 0
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/customer/:phone', async (req, res, next) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }

  try {
    const customer = await Customer.findOne({ phone }).lean();
    if (!customer) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    return res.json(customer);
  } catch (error) {
    return next(error);
  }
});

app.put('/api/customer/:phone', async (req, res, next) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }

  try {
    const customer = await Customer.findOneAndUpdate(
      { phone },
      { $setOnInsert: { phone } },
      { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true, lean: true }
    );
    return res.json(customer);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/customer/:phone/open', async (req, res, next) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }

  try {
    const customer = await Customer.findOneAndUpdate(
      { phone },
      { $inc: { walletOpens: 1 }, $set: { lastWalletOpenedAt: new Date() } },
      { new: true, projection: { walletOpens: 1, _id: 0 }, lean: true }
    );
    if (!customer) {
      return res.status(404).json({ message: 'Profile not found' });
    }
    return res.json({ walletOpens: customer.walletOpens });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/reviews', async (req, res, next) => {
  try {
    const reviews = await Customer.find({ rating: { $gte: 1, $lte: 5 } })
      .sort({ ratingUpdatedAt: -1, _id: -1 })
      .limit(12)
      .select('name rating ratingFeedback ratingUpdatedAt')
      .lean();
    return res.json({
      reviews: reviews.map((review) => ({
        name: typeof review.name === 'string' && review.name.trim() && review.name !== 'Valued Guest'
          ? review.name.trim()
          : 'random person',
        rating: review.rating,
        feedback: review.ratingFeedback || '',
        updatedAt: review.ratingUpdatedAt
      }))
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/customer/:phone/rating', async (req, res, next) => {
  const phone = normalizePhone(req.params.phone);
  const { rating, feedback: inputFeedback } = req.body;
  const feedback = typeof inputFeedback === 'string' ? inputFeedback.trim() : '';

  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Choose a star rating from 1 to 5.' });
  }
  if (typeof inputFeedback !== 'string' || feedback.length > 500) {
    return res.status(400).json({ error: 'Feedback must be 500 characters or fewer.' });
  }

  try {
    const customer = await Customer.findOneAndUpdate(
      { phone },
      { $set: { rating, ratingFeedback: feedback, ratingUpdatedAt: new Date() } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
        projection: { name: 1, rating: 1, ratingFeedback: 1, ratingUpdatedAt: 1 },
        lean: true
      }
    );
    return res.json({
      success: true,
      review: {
        name: typeof customer.name === 'string' && customer.name.trim() && customer.name !== 'Valued Guest'
          ? customer.name.trim()
          : 'random person',
        rating: customer.rating,
        feedback: customer.ratingFeedback || '',
        updatedAt: customer.ratingUpdatedAt
      }
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/cashier/award-stamp', requireCashierPin, async (req, res, next) => {
  const { phone: inputPhone, billAmount, name: inputName, items: inputItems } = req.body;

  const phone = normalizePhone(inputPhone);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }

  const amount = billAmount === '' || billAmount === undefined
    ? 0
    : Number(billAmount);
  if (!Number.isFinite(amount) || amount < 0) {
    return res.status(400).json({ error: 'Bill amount must be a non-negative number.' });
  }

  const name = typeof inputName === 'string' ? inputName.trim() : '';
  const items = typeof inputItems === 'string' ? inputItems.trim() : '';
  if (name.length > 80) {
    return res.status(400).json({ error: 'Customer name must be 80 characters or fewer.' });
  }
  if (items.length > 160) {
    return res.status(400).json({ error: 'Purchase details must be 160 characters or fewer.' });
  }

  try {
    const currentPoints = { $ifNull: ['$activePoints', 0] };
    const pointsAfterStamp = { $add: [currentPoints, 1] };
    const customer = await Customer.findOneAndUpdate(
      { phone },
      [{
        $set: {
          phone,
          name: name
            ? { $literal: name }
            : { $ifNull: ['$name', 'Valued Guest'] },
          activePoints: { $mod: [pointsAfterStamp, 5] },
          rewardsAvailable: {
            $add: [
              { $ifNull: ['$rewardsAvailable', 0] },
              { $floor: { $divide: [pointsAfterStamp, 5] } }
            ]
          },
          totalLifetimeVisits: { $add: [{ $ifNull: ['$totalLifetimeVisits', 0] }, 1] },
          history: {
            $concatArrays: [
              { $ifNull: ['$history', []] },
              [{ action: 'EARN', amount, items: { $literal: items }, date: '$$NOW' }]
            ]
          }
        }
      }],
      { new: true, upsert: true, lean: true }
    );
    if (name && customer.name !== name) {
      throw new Error('Customer name was not persisted with the visit.');
    }
    if (items && customer.history[customer.history.length - 1]?.items !== items) {
      throw new Error('Purchased items were not persisted with the visit.');
    }
    return res.json({ success: true, customer });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/cashier/redeem-reward', requireCashierPin, async (req, res, next) => {
  const { phone: inputPhone } = req.body;
  const phone = normalizePhone(inputPhone);
  if (!phone) {
    return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
  }

  try {
    const customer = await Customer.findOneAndUpdate(
      { phone, rewardsAvailable: { $gt: 0 } },
      {
        $inc: { rewardsAvailable: -1 },
        $push: { history: { action: 'REDEEM', amount: 0, date: new Date() } }
      },
      { new: true, lean: true }
    );
    if (!customer) {
      return res.status(400).json({ error: 'No claimable rewards available.' });
    }
    return res.json({ success: true, customer });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large. Product images must be no larger than 10 MB.' });
  }
  return res.status(error.statusCode || 500).json({
    error: error.statusCode === 503
      ? error.message
      : 'Something went wrong. Please try again.'
  });
});

async function startServer() {
  try {
    if (!CASHIER_PIN) {
      throw new Error('CASHIER_PIN must be set in the environment before starting the server.');
    }
    const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL;
    if (!mongoUri || mongoUri.includes('<db_password>')) {
      throw new Error('Set MONGO_URI (or MONGO_URL) to the MongoDB Atlas connection string with <db_password> replaced by the URL-encoded database password.');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully');

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error('CRITICAL STARTUP ERROR:', error);
    process.exit(1);
  }
}

startServer();
