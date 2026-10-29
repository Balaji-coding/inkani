require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Customer = require('./models/Customer');
const LoyaltySettings = require('./models/LoyaltySettings');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const CASHIER_PIN = process.env.CASHIER_PIN;
const DEFAULT_SHOP_ADDRESS = 'Teppakulam, Madurai, Tamil Nadu 625009';
const DEFAULT_SHOP_MAPS_URL = 'https://www.google.com/maps/place/9%C2%B054\'42.2%22N+78%C2%B008\'53.1%22E/@9.9117149,78.1471646,18z/data=!3m1!4b1!4m13!1m8!3m7!1s0x3b00c50726b72ae3:0xe013610ff6d4b0d6!2sTeppakulam,+Madurai,+Tamil+Nadu+625009!3b1!8m2!3d9.9114761!4d78.1498516!16s%2Fg%2F11gjw_8qy3!3m3!8m2!3d9.911713!4d78.148075?entry=ttu&g_ep=EgoyMDI2MTAyMC4wIKXMDSoASAFQAw%3D%3D';

app.use(express.json({ limit: '10kb' }));
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
  if (!CASHIER_PIN || typeof req.body.pin !== 'string' || req.body.pin !== CASHIER_PIN) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Cashier PIN' });
  }
  return next();
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
    const settings = await LoyaltySettings.findById('storefront').lean();
    return res.json({ available: settings?.custardFruitSaladAvailable ?? true });
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
    const settings = await LoyaltySettings.findByIdAndUpdate(
      'storefront',
      { $set: { custardFruitSaladAvailable: available } },
      { new: true, upsert: true, setDefaultsOnInsert: true, lean: true }
    );
    return res.json({ success: true, available: settings.custardFruitSaladAvailable });
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
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

async function start() {
  if (!CASHIER_PIN) {
    throw new Error('CASHIER_PIN must be set in the environment before starting the server.');
  }
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/inkanibites');
  app.listen(PORT, () => {
    console.log(`Inkani Bites is running on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error('Unable to start Inkani Bites:', error);
  process.exitCode = 1;
});
