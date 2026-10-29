const phoneInput = document.getElementById('searchPhone');
const walletButton = document.getElementById('walletButton');
const walletForm = document.getElementById('walletForm');
const walletResult = document.getElementById('walletResult');
const walletEmpty = document.getElementById('walletEmpty');
const walletError = document.getElementById('walletError');
const walletRefresh = document.getElementById('walletRefresh');
const SAVED_PHONE_KEY = 'inkaniCustomerPhone';
let activePhone = null;
let walletRefreshInProgress = false;
const rewardNoticeVisits = new Map();
const ORDER_PHONE_NUMBER = '9345065011';
const shopAddress = document.getElementById('shopAddress');
const shopMapLink = document.getElementById('shopMapLink');
const locationError = document.getElementById('locationError');
const feedbackDialog = document.getElementById('feedbackDialog');
const feedbackForm = document.getElementById('feedbackForm');
const feedbackText = document.getElementById('feedbackText');
const feedbackError = document.getElementById('feedbackError');
const feedbackSubmit = document.getElementById('submitFeedback');
const ratingCaption = document.getElementById('ratingCaption');
let currentWalletData = null;
let selectedRating = 0;

const ratingCaptions = ['', 'We’re sorry it missed the mark.', 'There’s room for us to do better.', 'Thanks! We’re glad you enjoyed it.', 'Wonderful! We’re so glad.', 'Amazing! Thank you for the love.'];

function normalizedPhone(value) {
  const digits = value.replace(/\D/g, '');
  const phone = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  return /^\d{10}$/.test(phone) ? phone : null;
}

function showPanel(panel) {
  walletForm.classList.toggle('hidden', panel !== 'form');
  walletResult.classList.toggle('hidden', panel !== 'result');
  walletEmpty.classList.toggle('hidden', panel !== 'empty');
  walletError.classList.add('hidden');
}

function getSavedPhone() {
  try {
    return localStorage.getItem(SAVED_PHONE_KEY);
  } catch (error) {
    console.error('Unable to read the saved rewards phone number:', error);
    return null;
  }
}

function savePhone(phone) {
  try {
    localStorage.setItem(SAVED_PHONE_KEY, phone);
  } catch (error) {
    console.error('Unable to save the rewards phone number:', error);
    walletRefresh.textContent = 'Your browser could not save this number for next time.';
  }
}

function renderPurchaseHistory(history) {
  const purchaseList = document.getElementById('purchaseHistory');
  const purchaseEmpty = document.getElementById('purchaseEmpty');
  const purchases = (Array.isArray(history) ? history : [])
    .filter((entry) => entry.action === 'EARN')
    .slice(-5)
    .reverse();

  purchaseList.replaceChildren();
  purchaseEmpty.classList.toggle('hidden', purchases.length > 0);
  for (const purchase of purchases) {
    const row = document.createElement('li');
    const details = document.createElement('span');
    const date = document.createElement('small');
    const summary = document.createElement('strong');
    const amount = document.createElement('span');
    const purchaseDate = new Date(purchase.date);
    details.className = 'purchase-visit';
    date.textContent = Number.isNaN(purchaseDate.getTime())
      ? 'Recent visit'
      : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(purchaseDate);
    summary.textContent = purchase.items || 'In-store purchase';
    amount.textContent = Number(purchase.amount) > 0
      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(purchase.amount)
      : 'Visit';
    details.append(date, summary);
    row.append(details, amount);
    purchaseList.appendChild(row);
  }
}

function showRewardUnlocked(name) {
  const dialog = document.getElementById('rewardDialog');
  const firstName = name && name !== 'Valued Guest' ? name : 'there';
  document.querySelector('.dialog-copy').textContent =
    `Congratulations, ${firstName}! You’ve collected five visits. Please enjoy a complimentary fruit custard on your next visit. We look forward to welcoming you again.`;
  if (!dialog.open) dialog.showModal();
}

function maybeShowRewardUnlocked(data, name) {
  const totalVisits = Number(data.totalLifetimeVisits) || 0;
  const unlockVisit = Math.floor(totalVisits / 5) * 5;
  if (unlockVisit < 5) return;

  const noticeKey = `inkaniRewardNotice:${data.phone}`;
  let lastNotifiedVisit = rewardNoticeVisits.get(data.phone) || 0;
  try {
    lastNotifiedVisit = Math.max(lastNotifiedVisit, Number(localStorage.getItem(noticeKey)) || 0);
    if (unlockVisit <= lastNotifiedVisit) return;
    localStorage.setItem(noticeKey, String(unlockVisit));
  } catch (error) {
    console.error('Unable to remember the reward notification:', error);
    if (unlockVisit <= lastNotifiedVisit) return;
  }
  rewardNoticeVisits.set(data.phone, unlockVisit);
  if (data.rewardsAvailable > 0) showRewardUnlocked(name);
}

function renderWallet(data) {
  currentWalletData = data;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  document.getElementById('customerName').textContent = name && name !== 'Valued Guest'
    ? `Welcome, ${name}`
    : 'Welcome back';
  document.getElementById('customerPhone').textContent = `+91 ${data.phone}`;
  document.getElementById('stampCount').textContent = `${data.activePoints} OF 5`;
  const slots = document.getElementById('stampSlots');
  slots.replaceChildren();
  for (let index = 0; index < 5; index += 1) {
    const slot = document.createElement('span');
    const stamped = index < data.activePoints;
    slot.className = `stamp-slot${stamped ? ' stamped' : ''}`;
    slot.setAttribute('aria-label', stamped ? `Stamp ${index + 1} collected` : `Stamp ${index + 1} remaining`);
    slot.textContent = stamped ? '✳' : String(index + 1).padStart(2, '0');
    slots.appendChild(slot);
  }
  const remaining = 5 - data.activePoints;
  document.getElementById('walletStatus').textContent = remaining
    ? `${remaining} more ${remaining === 1 ? 'visit' : 'visits'} until your fruit custard is on us.`
    : 'Your next treat is ready to claim.';
  const rewardBanner = document.getElementById('rewardBanner');
  rewardBanner.classList.toggle('hidden', data.rewardsAvailable < 1);
  document.getElementById('rewardQuantity').textContent = data.rewardsAvailable > 1 ? `×${data.rewardsAvailable}` : '';
  document.getElementById('copyPass').dataset.phone = data.phone;
  document.getElementById('openFeedback').textContent = data.rating
    ? 'Update your feedback →'
    : 'Share your feedback →';
  renderPurchaseHistory(data.history);
  maybeShowRewardUnlocked(data, name);
  walletRefresh.textContent = 'Updated just now · refreshes every 30 seconds';
  showPanel('result');
}

function updateRatingSelection(rating) {
  selectedRating = rating;
  document.querySelectorAll('.rating-star').forEach((button) => {
    const active = Number(button.dataset.rating) <= rating;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(Number(button.dataset.rating) === rating));
  });
  ratingCaption.textContent = ratingCaptions[rating] || 'Tap a star to rate your visit.';
}

function openFeedbackDialog({ prompt = false } = {}) {
  if (!currentWalletData) return;
  selectedRating = Number(currentWalletData.rating) || 0;
  updateRatingSelection(selectedRating);
  feedbackText.value = currentWalletData.ratingFeedback || '';
  feedbackError.classList.add('hidden');
  document.getElementById('feedbackDialogCopy').textContent = prompt
    ? 'We’d love to hear what you think. Your honest feedback helps us make every visit even better.'
    : 'Your feedback is always welcome. You can update your rating or note any time.';
  feedbackSubmit.innerHTML = currentWalletData.rating
    ? 'Update feedback <span aria-hidden="true">→</span>'
    : 'Share feedback <span aria-hidden="true">→</span>';
  if (!feedbackDialog.open) feedbackDialog.showModal();
}

function promptForFirstRating(data) {
  if (data.rating) return;
  const rewardDialog = document.getElementById('rewardDialog');
  if (rewardDialog.open) {
    rewardDialog.addEventListener('close', () => openFeedbackDialog({ prompt: true }), { once: true });
    return;
  }
  openFeedbackDialog({ prompt: true });
}

async function loadReviews() {
  const reviewsList = document.getElementById('reviewsList');
  const reviewsEmpty = document.getElementById('reviewsEmpty');
  try {
    const response = await fetch('/api/reviews');
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.reviews)) {
      throw new Error(data.error || 'Could not load customer reviews.');
    }

    reviewsList.replaceChildren();
    if (data.reviews.length === 0) {
      reviewsList.appendChild(reviewsEmpty);
      reviewsEmpty.classList.remove('hidden');
      return;
    }
    data.reviews.forEach((review) => {
      const card = document.createElement('article');
      const stars = document.createElement('div');
      const quote = document.createElement('p');
      const attribution = document.createElement('div');
      const name = document.createElement('strong');
      const score = document.createElement('span');
      card.className = 'review-card';
      stars.className = 'review-stars';
      stars.setAttribute('aria-label', `${review.rating} out of 5 stars`);
      stars.textContent = `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`;
      quote.className = 'review-quote';
      quote.textContent = review.feedback
        ? `“${review.feedback}”`
        : 'Thank you for sharing your rating with us.';
      attribution.className = 'review-attribution';
      name.textContent = review.name || 'random person';
      score.textContent = `${review.rating}/5 stars`;
      attribution.append(name, score);
      card.append(stars, quote, attribution);
      reviewsList.appendChild(card);
    });
  } catch (error) {
    console.error('Unable to load customer reviews:', error);
    reviewsList.replaceChildren();
    reviewsEmpty.textContent = 'Customer reviews are temporarily unavailable.';
    reviewsEmpty.classList.remove('hidden');
    reviewsList.appendChild(reviewsEmpty);
  }
}

async function submitFeedback(event) {
  event.preventDefault();
  feedbackError.classList.add('hidden');
  if (!selectedRating) {
    feedbackError.textContent = 'Please choose a star rating before sharing. You can also select “Maybe later”.';
    feedbackError.classList.remove('hidden');
    return;
  }
  if (!currentWalletData?.phone) {
    feedbackError.textContent = 'Please look up your rewards pass before sharing feedback.';
    feedbackError.classList.remove('hidden');
    return;
  }

  feedbackSubmit.disabled = true;
  feedbackSubmit.textContent = 'Saving your feedback…';
  try {
    const response = await fetch(`/api/customer/${encodeURIComponent(currentWalletData.phone)}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: selectedRating, feedback: feedbackText.value })
    });
    const data = await response.json();
    if (!response.ok) {
      feedbackError.textContent = data.error || data.message || 'We could not save your feedback. Please try again.';
      feedbackError.classList.remove('hidden');
      return;
    }

    currentWalletData.rating = data.review.rating;
    currentWalletData.ratingFeedback = data.review.feedback;
    currentWalletData.ratingUpdatedAt = data.review.updatedAt;
    document.getElementById('openFeedback').textContent = 'Update your feedback →';
    feedbackDialog.close();
    await loadReviews();
  } catch {
    feedbackError.textContent = 'Unable to reach the server. Please try again.';
    feedbackError.classList.remove('hidden');
  } finally {
    feedbackSubmit.disabled = false;
    feedbackSubmit.innerHTML = currentWalletData?.rating
      ? 'Update feedback <span aria-hidden="true">→</span>'
      : 'Share feedback <span aria-hidden="true">→</span>';
  }
}

async function loadShopLocation() {
  try {
    const response = await fetch('/api/store-location');
    const data = await response.json();
    if (!response.ok || typeof data.address !== 'string' || typeof data.mapsUrl !== 'string') {
      throw new Error(data.error || 'Could not load the current shop location.');
    }

    shopAddress.textContent = data.address;
    shopMapLink.href = data.mapsUrl;
    shopMapLink.removeAttribute('aria-disabled');
    shopMapLink.removeAttribute('tabindex');
    shopMapLink.innerHTML = 'Get directions <span aria-hidden="true">↗</span>';
    locationError.classList.add('hidden');
  } catch (error) {
    console.error('Unable to load the current shop location:', error);
    shopAddress.textContent = 'Please contact us to confirm today’s location.';
    shopMapLink.removeAttribute('href');
    shopMapLink.setAttribute('aria-disabled', 'true');
    shopMapLink.setAttribute('tabindex', '-1');
    shopMapLink.textContent = 'Directions unavailable';
    locationError.textContent = 'The current location could not be loaded. Please try again shortly.';
    locationError.classList.remove('hidden');
  }
}

async function fetchWallet({ silent = false, phoneOverride = null } = {}) {
  const phone = phoneOverride || normalizedPhone(phoneInput.value);
  if (!phone) {
    if (silent) return;
    walletError.textContent = 'Please enter a valid 10-digit mobile number.';
    walletError.classList.remove('hidden');
    return;
  }

  if (walletRefreshInProgress) return;
  walletRefreshInProgress = true;
  activePhone = phone;
  phoneInput.value = phone;
  savePhone(phone);
  if (!silent) {
    walletButton.disabled = true;
    walletButton.innerHTML = 'Finding your pass <span class="loading-dot">…</span>';
    walletError.classList.add('hidden');
    walletEmpty.classList.add('hidden');
  }

  try {
    const response = await fetch(`/api/customer/${encodeURIComponent(phone)}`);
    const data = await response.json();
    if (response.status === 404) {
      if (silent) {
        walletRefresh.textContent = 'Your latest rewards pass was not found.';
        return;
      }
      currentWalletData = { phone, rating: 0, ratingFeedback: '' };
      showPanel('empty');
      promptForFirstRating(currentWalletData);
      return;
    }
    if (!response.ok) throw new Error(data.error || 'Unable to load your rewards pass.');
    if (!silent) {
      try {
        const openResponse = await fetch(`/api/customer/${encodeURIComponent(phone)}/open`, { method: 'POST' });
        if (!openResponse.ok) throw new Error('Could not record this pass opening.');
      } catch (error) {
        console.error('Unable to record customer wallet opening:', error);
      }
    }
    renderWallet(data);
    if (!silent) promptForFirstRating(data);
  } catch (error) {
    if (silent) {
      walletRefresh.textContent = 'Could not refresh right now. Will try again shortly.';
      return;
    }
    walletError.textContent = error.message || 'We could not load your pass. Please try again.';
    walletError.classList.remove('hidden');
  } finally {
    walletRefreshInProgress = false;
    if (!silent) {
      walletButton.disabled = false;
      walletButton.innerHTML = 'Find my rewards <span aria-hidden="true">→</span>';
    }
  }
}

walletButton.addEventListener('click', fetchWallet);
phoneInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') fetchWallet();
});
function forgetSavedPhone() {
  activePhone = null;
  try {
    localStorage.removeItem(SAVED_PHONE_KEY);
  } catch (error) {
    console.error('Unable to remove the saved rewards phone number:', error);
  }
  phoneInput.value = '';
  showPanel('form');
}

document.getElementById('changeNumber').addEventListener('click', forgetSavedPhone);
document.getElementById('tryAnother').addEventListener('click', forgetSavedPhone);
document.getElementById('openFeedback').addEventListener('click', () => openFeedbackDialog());
document.getElementById('closeFeedback').addEventListener('click', () => feedbackDialog.close());
feedbackForm.addEventListener('submit', submitFeedback);
document.querySelectorAll('.rating-star').forEach((button) => {
  button.addEventListener('click', () => updateRatingSelection(Number(button.dataset.rating)));
});
feedbackDialog.addEventListener('click', (event) => {
  if (event.target === feedbackDialog) feedbackDialog.close();
});
document.getElementById('closeRewardDialog').addEventListener('click', () => document.getElementById('rewardDialog').close());
document.getElementById('enjoyReward').addEventListener('click', () => document.getElementById('rewardDialog').close());
document.getElementById('closeOrderDialog').addEventListener('click', () => document.getElementById('orderDialog').close());
document.getElementById('orderProduct').addEventListener('click', () => {
  const dialog = document.getElementById('orderDialog');
  const availability = dialog.dataset.available;
  const available = availability === 'true';
  const unavailable = availability === 'false';
  document.getElementById('orderDialogEyebrow').textContent = unavailable
    ? 'A QUICK STOCK UPDATE'
    : 'WE’D LOVE TO SERVE YOU';
  document.getElementById('orderDialogTitle').innerHTML = available
    ? 'A little treat<br><em>is just a call away.</em>'
    : unavailable
      ? 'We’re sorry,<br><em>this treat is out of stock.</em>'
      : 'Let us help you<br><em>choose something lovely.</em>';
  document.getElementById('orderDialogCopy').textContent = available
    ? 'Online ordering is coming soon. For now, please call us to place your order—we look forward to preparing something delicious for you.'
    : unavailable
      ? 'Custard Fruit Salad is not currently in stock. Please call us and we’ll be happy to let you know what’s freshly available.'
      : 'We can’t confirm the latest stock right now. Please call us and our team will be happy to help with your order.';
  document.getElementById('callStore').textContent = `Call Inkani Bites · ${ORDER_PHONE_NUMBER}`;
  if (!dialog.open) dialog.showModal();
});
document.getElementById('orderDialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

async function loadProductAvailability() {
  const button = document.getElementById('orderProduct');
  const status = document.getElementById('productStock');
  try {
    const response = await fetch('/api/products/custard-fruit-salad');
    const data = await response.json();
    if (!response.ok || typeof data.available !== 'boolean') {
      throw new Error(data.error || 'Product availability is unavailable.');
    }
    applyProductAvailability(data.available);
  } catch (error) {
    status.textContent = 'We could not confirm availability. Please call us to check.';
    button.textContent = `Call to check · ${ORDER_PHONE_NUMBER}`;
    button.disabled = false;
    document.getElementById('orderDialog').dataset.available = 'unknown';
    console.error('Unable to load fruit custard availability:', error);
  }
}

function applyProductAvailability(available) {
  const dialog = document.getElementById('orderDialog');
  const status = document.getElementById('productStock');
  const button = document.getElementById('orderProduct');
  dialog.dataset.available = String(available);
  status.textContent = available
    ? 'Freshly available · Please call to order'
    : 'Currently out of stock · Please call for today’s selection';
  button.textContent = available ? 'Order by phone · 9345065011' : 'See today’s availability';
  const arrow = document.createElement('span');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '→';
  button.appendChild(arrow);
  button.disabled = false;
  document.getElementById('custardProduct').classList.toggle('is-unavailable', !available);
}
document.getElementById('copyPass').addEventListener('click', async (event) => {
  const url = new URL('/', window.location.origin);
  url.searchParams.set('phone', event.currentTarget.dataset.phone);
  try {
    await navigator.clipboard.writeText(url.toString());
    event.currentTarget.textContent = 'Link copied ✓';
  } catch {
    event.currentTarget.textContent = 'Unable to copy link';
  }
});

const updates = typeof BroadcastChannel === 'function'
  ? new BroadcastChannel('inkani-rewards')
  : null;
if (updates) {
  updates.addEventListener('message', (event) => {
    if (event.data?.type === 'shop-location') {
      loadShopLocation();
      return;
    }
    if (event.data?.type === 'product-availability' && typeof event.data.available === 'boolean') {
      applyProductAvailability(event.data.available);
      return;
    }
    if (event.data?.phone === activePhone) fetchWallet({ silent: true, phoneOverride: activePhone });
  });
}

window.addEventListener('storage', (event) => {
  if (event.key === 'inkaniProductAvailabilityUpdated' && event.newValue) {
    try {
      const update = JSON.parse(event.newValue);
      if (typeof update.available === 'boolean') applyProductAvailability(update.available);
    } catch (error) {
      console.error('Unable to read product availability update:', error);
    }
  }
  if (event.key === 'inkaniRewardUpdated' && event.newValue) {
    try {
      const update = JSON.parse(event.newValue);
      if (update.phone === activePhone) fetchWallet({ silent: true, phoneOverride: activePhone });
    } catch (error) {
      console.error('Unable to read rewards update notification:', error);
    }
  }
  if (event.key === 'inkaniShopLocationUpdated' && event.newValue) loadShopLocation();
});

window.setInterval(() => {
  if (document.visibilityState === 'visible') loadProductAvailability();
  if (document.visibilityState === 'visible') loadShopLocation();
  if (activePhone && document.visibilityState === 'visible') {
    fetchWallet({ silent: true, phoneOverride: activePhone });
  }
}, 30_000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && activePhone) {
    fetchWallet({ silent: true, phoneOverride: activePhone });
  }
});

const initialPhone = new URLSearchParams(window.location.search).get('phone')
  || getSavedPhone();
if (initialPhone && normalizedPhone(initialPhone)) {
  phoneInput.value = initialPhone;
  fetchWallet({ phoneOverride: normalizedPhone(initialPhone) });
}
loadProductAvailability();
loadShopLocation();
loadReviews();

const revealItems = document.querySelectorAll('.reveal');
document.documentElement.classList.add('has-reveal-animations');
if ('IntersectionObserver' in window) {
  const revealVisibleItems = () => {
    for (const item of revealItems) {
      if (item.classList.contains('reveal-pending')) {
        const bounds = item.getBoundingClientRect();
        if (bounds.top < window.innerHeight && bounds.bottom > 0) {
          item.classList.remove('reveal-pending');
          item.classList.add('is-visible');
        }
      }
    }
  };
  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.remove('reveal-pending');
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.16, rootMargin: '0px 0px -35px 0px' });
  revealItems.forEach((item) => {
    const bounds = item.getBoundingClientRect();
    if (bounds.top >= window.innerHeight || bounds.bottom <= 0) {
      item.classList.add('reveal-pending');
      revealObserver.observe(item);
    } else {
      item.classList.add('is-visible');
    }
  });
  window.addEventListener('scroll', revealVisibleItems, { passive: true });
  window.addEventListener('resize', revealVisibleItems);
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}
