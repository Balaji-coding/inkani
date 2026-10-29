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
const availabilitySelect = document.getElementById('productAvailability');
const availabilityStatus = document.getElementById('availabilityStatus');
const availabilityResult = document.getElementById('availabilityResult');
const saveAvailabilityButton = document.getElementById('saveAvailability');
const availabilityPinInput = document.getElementById('availabilityPin');
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

async function loadProductAvailability() {
  try {
    const response = await fetch('/api/products/custard-fruit-salad');
    const data = await response.json();
    if (!response.ok || typeof data.available !== 'boolean') {
      throw new Error(data.error || 'Could not load product availability.');
    }
    availabilitySelect.value = String(data.available);
    availabilitySelect.disabled = false;
    saveAvailabilityButton.disabled = false;
    availabilityStatus.textContent = data.available ? 'ACTIVE' : 'INACTIVE';
    availabilityStatus.classList.toggle('is-inactive', !data.available);
  } catch (error) {
    availabilityStatus.textContent = 'STATUS UNAVAILABLE';
    availabilityResult.textContent = error.message || 'Could not load product availability.';
    availabilityResult.className = 'counter-result failure';
  }
}

async function saveProductAvailability() {
  if (!availabilityPinInput.value) {
    availabilityResult.textContent = 'Enter your team PIN in the product availability section to save this change.';
    availabilityResult.className = 'counter-result failure';
    availabilityPinInput.focus();
    return;
  }

  saveAvailabilityButton.disabled = true;
  availabilityResult.className = 'counter-result loading';
  availabilityResult.textContent = 'Updating product status…';
  try {
    const response = await fetch('/api/cashier/product-availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: availabilityPinInput.value, available: availabilitySelect.value === 'true' })
    });
    const data = await response.json();
    if (!response.ok) {
      availabilityResult.textContent = data.error || 'Could not update product availability.';
      availabilityResult.className = 'counter-result failure';
      return;
    }
    availabilityStatus.textContent = data.available ? 'ACTIVE' : 'INACTIVE';
    availabilityStatus.classList.toggle('is-inactive', !data.available);
    const update = { type: 'product-availability', available: data.available, timestamp: Date.now() };
    try {
      localStorage.setItem('inkaniProductAvailabilityUpdated', JSON.stringify(update));
    } catch (error) {
      console.error('Unable to notify other tabs about product availability:', error);
    }
    if (rewardUpdates) rewardUpdates.postMessage(update);
    availabilityResult.textContent = data.available
      ? 'Custard Fruit Salad is now active and available to order.'
      : 'Custard Fruit Salad is now inactive and marked out of stock.';
    availabilityResult.className = 'counter-result success';
  } catch {
    availabilityResult.textContent = 'Unable to reach the server. Please try again.';
    availabilityResult.className = 'counter-result failure';
  } finally {
    saveAvailabilityButton.disabled = false;
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
saveAvailabilityButton.addEventListener('click', saveProductAvailability);
form.addEventListener('submit', (event) => event.preventDefault());
loadProductAvailability();
shopLocationForm.addEventListener('submit', saveShopLocation);
loadShopLocation();
