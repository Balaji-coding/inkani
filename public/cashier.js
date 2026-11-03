const form = document.getElementById('cashierForm');
const verificationForm = document.getElementById('verificationForm');
const verificationPhoneInput = document.getElementById('verificationPhone');
const verificationPinInput = document.getElementById('verificationPin');
const verificationResult = document.getElementById('verificationResult');
const verificationError = document.getElementById('verificationError');
const verifyButton = document.getElementById('verifyButton');
const phoneInput = document.getElementById('cPhone');
const nameInput = document.getElementById('cName');
const billInput = document.getElementById('cBill');
const itemsInput = document.getElementById('cItems');
const pinInput = document.getElementById('cPin');
const resultBox = document.getElementById('resultBox');
const awardButton = document.getElementById('awardButton');
const redeemButton = document.getElementById('redeemButton');
const productAdminList = document.getElementById('productAdminList');
const productEditor = document.getElementById('productEditor');
const productEditorTitle = document.getElementById('productEditorTitle');
const productNameInput = document.getElementById('productName');
const productPriceInput = document.getElementById('productPrice');
const productDescriptionInput = document.getElementById('productDescription');
const productOfferInput = document.getElementById('productOffer');
const productImageInput = document.getElementById('productImage');
const productImagePreview = document.getElementById('productImagePreview');
const productAvailableSelect = document.getElementById('productAvailable');
const productPinInput = document.getElementById('productPin');
const productResult = document.getElementById('productResult');
let cashierProducts = [];
let editingProductId = null;
let productImagePath = '';
const shopLocationForm = document.getElementById('shopLocationForm');
const shopAddressInput = document.getElementById('shopAddressInput');
const shopMapsUrlInput = document.getElementById('shopMapsUrlInput');
const locationPinInput = document.getElementById('locationPin');
const locationResult = document.getElementById('locationResult');
const saveLocationButton = document.getElementById('saveLocationButton');
const rewardUpdates = typeof BroadcastChannel === 'function'
  ? new BroadcastChannel('inkani-rewards')
  : null;

function normalizedPhone(value) {
  const digits = value.replace(/\D/g, '');
  const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^\d{10}$/.test(phone) ? phone : null;
}

function showResult(message, success) {
  resultBox.textContent = message;
  resultBox.className = `counter-result ${success ? 'success' : 'failure'}`;
}

function renderVerification(customer) {
  const activePoints = Math.max(0, Number(customer.activePoints) || 0);
  const progressPoints = Math.min(activePoints, 5);
  const totalVisits = Number(customer.totalLifetimeVisits) || 0;
  const rewardsAvailable = Number(customer.rewardsAvailable) || 0;
  const walletOpens = Number(customer.walletOpens) || 0;
  const name = typeof customer.name === 'string' && customer.name !== 'Valued Guest'
    ? customer.name
    : 'Name not provided';

  document.getElementById('verifiedName').textContent = name;
  document.getElementById('verifiedPhone').textContent = `+91 ${customer.phone}`;
  document.getElementById('verifiedVisits').textContent = String(totalVisits);
  document.getElementById('verifiedRewards').textContent = String(rewardsAvailable);
  document.getElementById('verifiedOpenSentence').textContent =
    `Customer opened their rewards pass ${walletOpens} ${walletOpens === 1 ? 'time' : 'times'}.`;
  document.getElementById('verifiedProgressLabel').textContent = `${progressPoints} / 5 visits`;
  const progress = document.getElementById('verifiedProgress');
  progress.style.width = `${progressPoints * 20}%`;
  progress.parentElement.setAttribute('aria-valuenow', String(progressPoints));
  document.getElementById('verificationMessage').textContent = rewardsAvailable > 0
    ? `${rewardsAvailable} reward${rewardsAvailable === 1 ? '' : 's'} ready to redeem.`
    : progressPoints === 5
      ? 'Reward progress complete. Please confirm the available reward with the team.'
      : `${5 - progressPoints} more visit${5 - progressPoints === 1 ? '' : 's'} until the next free fruit custard.`;

  verificationResult.classList.remove('hidden');
  verificationError.classList.add('hidden');
  verificationPhoneInput.value = customer.phone;
  phoneInput.value = customer.phone;
  nameInput.value = name === 'Name not provided' ? '' : name;
}

async function verifyCustomer(event) {
  event.preventDefault();
  verificationResult.classList.add('hidden');
  verificationError.classList.add('hidden');
  const phone = normalizedPhone(verificationPhoneInput.value);
  if (!phone) {
    verificationError.textContent = 'Enter a valid 10-digit mobile number.';
    verificationError.className = 'counter-result failure';
    verificationPhoneInput.focus();
    return;
  }
  if (!verificationPinInput.value) {
    verificationError.textContent = 'Enter your team PIN to verify this customer.';
    verificationError.className = 'counter-result failure';
    verificationPinInput.focus();
    return;
  }

  verifyButton.disabled = true;
  verificationError.classList.add('hidden');
  verifyButton.textContent = 'Checking customer pass…';
  try {
    const response = await fetch('/api/cashier/verify-customer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pin: verificationPinInput.value })
    });
    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (response.status === 404) {
        throw new Error('Customer verification is not available on the server currently running. Restart or redeploy the latest server.js, then reload this page.');
      }
      throw new Error('The server returned an invalid response while checking this customer.');
    }
    if (!response.ok) {
      verificationResult.classList.add('hidden');
      verificationError.textContent = data.error || data.message || 'Could not verify this customer.';
      verificationError.className = 'counter-result failure';
      return;
    }
    renderVerification(data);
  } catch (error) {
    verificationError.textContent = error.message || 'Unable to reach the server. Please try again.';
    verificationError.className = 'counter-result failure';
  } finally {
    verifyButton.disabled = false;
    verifyButton.innerHTML = 'Verify customer pass <span aria-hidden="true">→</span>';
  }
}

async function submitAction(action) {
  const phone = normalizedPhone(phoneInput.value);
  if (!phone) {
    showResult('Enter a valid 10-digit mobile number.', false);
    phoneInput.focus();
    return;
  }
  if (!pinInput.value) {
    showResult('Enter your team PIN to continue.', false);
    pinInput.focus();
    return;
  }
  if (action === 'award' && billInput.value && Number(billInput.value) < 0) {
    showResult('Bill amount cannot be negative.', false);
    billInput.focus();
    return;
  }

  awardButton.disabled = true;
  redeemButton.disabled = true;
  resultBox.className = 'counter-result loading';
  resultBox.textContent = action === 'award' ? 'Adding a visit…' : 'Redeeming a treat…';

  try {
    const response = await fetch(`/api/cashier/${action === 'award' ? 'award-stamp' : 'redeem-reward'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        pin: pinInput.value,
        ...(action === 'award' ? {
          billAmount: billInput.value || 0,
          name: nameInput.value.trim(),
          items: itemsInput.value.trim()
        } : {})
      })
    });
    const data = await response.json();
    if (!response.ok) {
      showResult(data.error || 'We could not complete that action. Please try again.', false);
      return;
    }
    const { customer } = data;
    if (customer.phone === normalizedPhone(verificationPhoneInput.value)) renderVerification(customer);
    const update = { phone: customer.phone, timestamp: Date.now() };
    try {
      localStorage.setItem('inkaniRewardUpdated', JSON.stringify(update));
    } catch (error) {
      console.error('Unable to notify other tabs about the rewards update:', error);
    }
    if (rewardUpdates) rewardUpdates.postMessage(update);
    if (action === 'award') {
      const rewardMessage = customer.rewardsAvailable
        ? ` ${customer.rewardsAvailable} free ${customer.rewardsAvailable === 1 ? 'treat is' : 'treats are'} ready to redeem!`
        : '';
      showResult(`Visit added! ${customer.activePoints} of 5 stamps collected.${rewardMessage}`, true);
    } else {
      showResult(`Treat redeemed! ${customer.rewardsAvailable} ${customer.rewardsAvailable === 1 ? 'treat' : 'treats'} remaining.`, true);
    }
  } catch {
    showResult('Unable to reach the server. Check your connection and try again.', false);
  } finally {
    awardButton.disabled = false;
    redeemButton.disabled = false;
  }
}

function renderProductAdminList() {
  productAdminList.replaceChildren();
  if (!cashierProducts.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No products yet. Create one to add it to the customer menu.';
    productAdminList.appendChild(empty);
    return;
  }
  for (const product of cashierProducts) {
    const row = document.createElement('div');
    row.className = 'product-admin-row';
    const details = document.createElement('div');
    const name = document.createElement('strong');
    const summary = document.createElement('small');
    const edit = document.createElement('button');
    name.textContent = product.name;
    summary.textContent = `₹${Number(product.price).toFixed(2)} · ${product.available ? 'Active' : 'Out of stock'}${product.offer ? ` · ${product.offer}` : ''} · ${product.imagePath ? 'Image saved' : 'No image'}`;
    details.append(name, summary);
    edit.className = 'button button-outline';
    edit.type = 'button';
    edit.dataset.editProduct = product.id;
    edit.textContent = 'Edit';
    row.append(details, edit);
    productAdminList.appendChild(row);
  }
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.products)) {
      throw new Error(data.error || 'Could not load products.');
    }
    cashierProducts = data.products;
    renderProductAdminList();
  } catch (error) {
    productAdminList.textContent = error.message || 'Could not load products.';
  }
}

function startProductEdit(product = null) {
  editingProductId = product ? product.id : null;
  productEditorTitle.textContent = product ? 'Edit product' : 'Create a product';
  productNameInput.value = product?.name || '';
  productPriceInput.value = product ? String(product.price) : '';
  productDescriptionInput.value = product?.description || '';
  productOfferInput.value = product?.offer || '';
  productImageInput.value = '';
  productImagePath = product?.imagePath || (product?.id === 'custard-fruit-salad' ? '/asserts/custard-fruit-salad.png' : '');
  productImagePreview.src = productImagePath;
  productImagePreview.classList.toggle('hidden', !productImagePath);
  productAvailableSelect.value = String(product?.available ?? true);
  document.getElementById('deleteProduct').classList.toggle('hidden', !product);
  productPinInput.value = '';
  productResult.className = 'counter-result hidden';
  productEditor.classList.remove('hidden');
  productNameInput.focus();
}

async function deleteProduct() {
  if (!editingProductId) return;
  if (!productPinInput.value) {
    productResult.textContent = 'Enter your team PIN to delete this product.';
    productResult.className = 'counter-result failure';
    productPinInput.focus();
    return;
  }
  if (!window.confirm(`Delete ${productNameInput.value.trim()} from the customer menu?`)) return;

  const deleteButton = document.getElementById('deleteProduct');
  deleteButton.disabled = true;
  try {
    const response = await fetch(`/api/cashier/products/${encodeURIComponent(editingProductId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: productPinInput.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not delete product.');
    cashierProducts = data.products;
    renderProductAdminList();
    productEditor.classList.add('hidden');
    productEditor.reset();
    productImagePreview.classList.add('hidden');
    productImagePreview.removeAttribute('src');
    productImagePath = '';
    const update = { type: 'product-catalog', timestamp: Date.now() };
    try {
      localStorage.setItem('inkaniProductCatalogUpdated', JSON.stringify(update));
    } catch (error) {
      console.error('Unable to notify other tabs about product updates:', error);
    }
    if (rewardUpdates) rewardUpdates.postMessage(update);
  } catch (error) {
    productResult.textContent = error.message || 'Unable to reach the server. Please try again.';
    productResult.className = 'counter-result failure';
  } finally {
    deleteButton.disabled = false;
  }
}

async function saveProduct(event) {
  event.preventDefault();
  productResult.textContent = 'Saving product…';
  productResult.className = 'counter-result loading';
  const saveButton = document.getElementById('saveProduct');
  saveButton.disabled = true;
  try {
    const imageFile = productImageInput.files[0];
    if (imageFile) {
      if (imageFile.size > 10 * 1024 * 1024) {
        throw new Error('Image must be no larger than 10 MB.');
      }
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(imageFile.type)) {
        throw new Error('Upload a PNG, JPEG, or WebP image.');
      }
    }
    const formData = new FormData();
    formData.append('name', productNameInput.value.trim());
    formData.append('price', productPriceInput.value);
    formData.append('description', productDescriptionInput.value.trim());
    formData.append('offer', productOfferInput.value.trim());
    formData.append('imagePath', productImagePath);
    formData.append('available', productAvailableSelect.value);
    if (imageFile) formData.append('image', imageFile);

    const response = await fetch(editingProductId
      ? `/api/cashier/products/${encodeURIComponent(editingProductId)}`
      : '/api/cashier/products', {
      method: editingProductId ? 'PUT' : 'POST',
      headers: { 'X-Cashier-PIN': productPinInput.value },
      body: formData
    });
    const data = await response.json();
    if (!response.ok) {
      productResult.textContent = data.error || 'Could not save product.';
      productResult.className = 'counter-result failure';
      return;
    }
    cashierProducts = data.products;
    renderProductAdminList();
    productEditor.classList.add('hidden');
    productEditor.reset();
    productPinInput.value = '';
    productImagePreview.classList.add('hidden');
    productImagePreview.removeAttribute('src');
    productImagePath = '';
    const update = { type: 'product-catalog', timestamp: Date.now() };
    try {
      localStorage.setItem('inkaniProductCatalogUpdated', JSON.stringify(update));
    } catch (error) {
      console.error('Unable to notify other tabs about product updates:', error);
    }
    if (rewardUpdates) rewardUpdates.postMessage(update);
  } catch (error) {
    productResult.textContent = error.message || 'Unable to reach the server. Please try again.';
    productResult.className = 'counter-result failure';
  } finally {
    saveButton.disabled = false;
  }
}

function showLocationResult(message, state) {
  locationResult.textContent = message;
  locationResult.className = `counter-result ${state}`;
}

async function loadShopLocation() {
  try {
    const response = await fetch('/api/store-location');
    const data = await response.json();
    if (!response.ok || typeof data.address !== 'string' || typeof data.mapsUrl !== 'string') {
      throw new Error(data.error || 'Could not load the saved shop location.');
    }
    shopAddressInput.value = data.address;
    shopMapsUrlInput.value = data.mapsUrl;
  } catch (error) {
    showLocationResult(error.message || 'Could not load the saved shop location.', 'failure');
  }
}

async function saveShopLocation(event) {
  event.preventDefault();
  const address = shopAddressInput.value.trim();
  const mapsUrl = shopMapsUrlInput.value.trim();
  const pin = locationPinInput.value;
  if (!address || !mapsUrl || !pin) {
    showLocationResult('Enter the current address, Google Maps link, and team PIN.', 'failure');
    return;
  }

  saveLocationButton.disabled = true;
  showLocationResult('Updating the customer-facing location…', 'loading');
  try {
    const response = await fetch('/api/cashier/store-location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, mapsUrl, pin })
    });
    const data = await response.json();
    if (!response.ok) {
      showLocationResult(data.error || 'Could not update the shop location.', 'failure');
      return;
    }

    shopAddressInput.value = data.address;
    shopMapsUrlInput.value = data.mapsUrl;
    locationPinInput.value = '';
    const update = { type: 'shop-location', timestamp: Date.now() };
    try {
      localStorage.setItem('inkaniShopLocationUpdated', JSON.stringify(update));
    } catch (error) {
      console.error('Unable to notify other tabs about the shop location update:', error);
    }
    if (rewardUpdates) rewardUpdates.postMessage(update);
    showLocationResult('Shop location updated. Customers will now see the new address and map pin.', 'success');
  } catch {
    showLocationResult('Unable to reach the server. Please try again.', 'failure');
  } finally {
    saveLocationButton.disabled = false;
  }
}

awardButton.addEventListener('click', () => submitAction('award'));
redeemButton.addEventListener('click', () => submitAction('redeem'));
verificationForm.addEventListener('submit', verifyCustomer);
document.getElementById('createProduct').addEventListener('click', () => startProductEdit());
document.getElementById('deleteProduct').addEventListener('click', deleteProduct);
document.getElementById('cancelProductEdit').addEventListener('click', () => {
  productEditor.classList.add('hidden');
  productImageInput.value = '';
});
productImageInput.addEventListener('change', () => {
  const imageFile = productImageInput.files[0];
  if (!imageFile) {
    productImagePreview.src = productImagePath;
    productImagePreview.classList.toggle('hidden', !productImagePath);
    return;
  }
  if (imageFile.size > 10 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(imageFile.type)) {
    productImageInput.value = '';
    productResult.textContent = imageFile.size > 10 * 1024 * 1024
      ? 'Image must be no larger than 10 MB.'
      : 'Upload a PNG, JPEG, or WebP image.';
    productResult.className = 'counter-result failure';
    productImagePreview.src = productImagePath;
    productImagePreview.classList.toggle('hidden', !productImagePath);
    return;
  }
  productImagePreview.src = URL.createObjectURL(imageFile);
  productImagePreview.classList.remove('hidden');
});
productAdminList.addEventListener('click', (event) => {
  const editButton = event.target.closest('[data-edit-product]');
  if (!editButton) return;
  const product = cashierProducts.find((item) => item.id === editButton.dataset.editProduct);
  if (product) startProductEdit(product);
});
productEditor.addEventListener('submit', saveProduct);
form.addEventListener('submit', (event) => event.preventDefault());
loadProducts();
shopLocationForm.addEventListener('submit', saveShopLocation);
loadShopLocation();
