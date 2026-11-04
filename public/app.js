const phoneInput = document.getElementById('searchPhone');
const visitHeading = document.getElementById('visitHeading');
const walletButton = document.getElementById('walletButton');
const walletForm = document.getElementById('walletForm');
const walletResult = document.getElementById('walletResult');
const walletEmpty = document.getElementById('walletEmpty');
const walletError = document.getElementById('walletError');
const walletRefresh = document.getElementById('walletRefresh');
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
const productList = document.getElementById('productList');
let storefrontProducts = [];

function formatProductName(name) {
  return name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function formatProductDescription(description) {
  if (typeof description !== 'string' || !description.trim()) return 'Freshly made with care.';
  const isIngredientList = /\s*\+\s*/.test(description);
  const formatted = description.trim()
    .replace(/\s*\+\s*/g, ', ')
    .replace(/\bpayaya\b/gi, 'papaya')
    .replace(/\bpinapple\b/gi, 'pineapple')
    .replace(/\btooty fruity\b/gi, 'tutti frutti')
    .replace(/\bcerry\b/gi, 'cherry')
    .replace(/\bincluded\s+net\s+weight\b/gi, '· Net weight')
    .replace(/\s+,/g, ',')
    .replace(/\s{2,}/g, ' ');
  const sentence = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  const descriptionText = /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
  return isIngredientList ? `Ingredients: ${descriptionText}` : descriptionText;
}

function optimizedProductImage(imagePath) {
  return typeof imagePath === 'string' && imagePath.startsWith('https://res.cloudinary.com/')
    ? imagePath.replace('/image/upload/', '/image/upload/f_auto,q_auto:good,w_1200/')
    : imagePath;
}

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

function renderVisitHeading(totalVisits = null) {
  const headingText = totalVisits === null ? 'Every visit ' : 'You’ve made ';
  const emphasizedText = totalVisits === null
    ? 'counts.'
    : `${totalVisits} ${totalVisits === 1 ? 'visit' : 'visits'}.`;
  const emphasis = document.createElement('em');
  emphasis.textContent = emphasizedText;
  visitHeading.replaceChildren(document.createTextNode(headingText), emphasis);
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
  const totalVisits = Number(data.totalLifetimeVisits);
  const visitCount = Number.isFinite(totalVisits) && totalVisits >= 0 ? totalVisits : 0;
  renderVisitHeading(visitCount);

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

async function fetchWallet({ silent = false, phoneOverride = null, promptForRating = false } = {}) {
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
  if (!silent) {
    walletButton.disabled = true;
    walletButton.innerHTML = 'Finding your pass <span class="loading-dot">…</span>';
    walletError.classList.add('hidden');
    walletEmpty.classList.add('hidden');
  }

  try {
    const customerUrl = `/api/customer/${encodeURIComponent(phone)}`;
    let response = await fetch(customerUrl);
    let data = await response.json();
    if (response.status === 404) {
      if (silent) {
        walletRefresh.textContent = 'Your latest rewards pass was not found.';
        return;
      }
      response = await fetch(customerUrl, { method: 'PUT' });
      data = await response.json();
    }
    if (!response.ok) throw new Error(data.error || 'Unable to load your rewards pass.');
    try {
      localStorage.setItem('inkaniCustomerPhone', phone);
    } catch (error) {
      console.error('Unable to remember the rewards phone number:', error);
    }
    if (!silent) {
      try {
        const openResponse = await fetch(`/api/customer/${encodeURIComponent(phone)}/open`, { method: 'POST' });
        if (!openResponse.ok) throw new Error('Could not record this pass opening.');
      } catch (error) {
        console.error('Unable to record customer wallet opening:', error);
      }
    }
    renderWallet(data);
    if (!silent && promptForRating) promptForFirstRating(data);
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

walletButton.addEventListener('click', () => fetchWallet({ promptForRating: true }));
phoneInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') fetchWallet({ promptForRating: true });
});
function changeWalletPhone() {
  activePhone = null;
  phoneInput.value = '';
  renderVisitHeading();
  try {
    localStorage.removeItem('inkaniCustomerPhone');
  } catch (error) {
    console.error('Unable to clear the remembered rewards phone number:', error);
  }
  showPanel('form');
}

document.getElementById('changeNumber').addEventListener('click', changeWalletPhone);
document.getElementById('tryAnother').addEventListener('click', changeWalletPhone);
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
productList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-order-product]');
  if (!button) return;
  const product = storefrontProducts.find((item) => item.id === button.dataset.orderProduct);
  if (!product) return;
  const dialog = document.getElementById('orderDialog');
  const available = product.available === true;
  document.getElementById('orderDialogEyebrow').textContent = !available
    ? 'A QUICK STOCK UPDATE'
    : 'WE’D LOVE TO SERVE YOU';
  document.getElementById('orderDialogTitle').innerHTML = available
    ? 'A little treat<br><em>is just a call away.</em>'
    : 'We’re sorry,<br><em>this treat is out of stock.</em>';
  document.getElementById('orderDialogCopy').textContent = available
    ? `Online ordering is coming soon. For now, please call us to order ${product.name}—we look forward to preparing something delicious for you.`
    : `${product.name} is not currently in stock. Please call us and we’ll be happy to let you know what’s freshly available.`;
  document.getElementById('callStore').textContent = `Call Inkani Bites · ${ORDER_PHONE_NUMBER}`;
  if (!dialog.open) dialog.showModal();
});
document.getElementById('orderDialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

function renderProducts() {
  productList.replaceChildren();
  if (!storefrontProducts.length) {
    const empty = document.createElement('p');
    empty.className = 'products-loading';
    empty.textContent = 'There are no products on today’s menu yet.';
    productList.appendChild(empty);
    return;
  }
  for (const product of storefrontProducts) {
    const productName = formatProductName(product.name);
    const card = document.createElement('article');
    card.className = `product-card reveal${product.available ? '' : ' is-unavailable'}`;
    const imageWrap = document.createElement('div');
    imageWrap.className = 'product-image-wrap';
    const showImagePlaceholder = () => {
      imageWrap.classList.add('is-placeholder');
      const placeholder = document.createElement('span');
      placeholder.className = 'product-image-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = '✳';
      imageWrap.prepend(placeholder);
    };
    if (product.imagePath) {
      const image = document.createElement('img');
      image.src = optimizedProductImage(product.imagePath);
      image.alt = product.imageAlt || `Photo of ${productName} from Inkani Bites in Madurai.`;
      image.loading = 'lazy';
      image.decoding = 'async';
      let triedLegacyImage = false;
      image.addEventListener('error', () => {
        if (product.id === 'custard-fruit-salad' && !triedLegacyImage) {
          triedLegacyImage = true;
          image.src = '/asserts/custard-fruit-salad.png';
        } else {
          image.remove();
          showImagePlaceholder();
        }
      });
      imageWrap.appendChild(image);
    } else {
      showImagePlaceholder();
    }
    const shine = document.createElement('div');
    shine.className = 'product-image-shine';
    imageWrap.appendChild(shine);
    if (product.id === 'custard-fruit-salad') {
      const badge = document.createElement('span');
      badge.className = 'product-image-badge';
      badge.textContent = 'A CUSTOMER FAVOURITE';
      imageWrap.appendChild(badge);
    }
    if (typeof product.offer === 'string' && product.offer.trim()) {
      const ribbon = document.createElement('span');
      ribbon.className = 'product-offer-ribbon';
      ribbon.setAttribute('aria-label', `Offer: ${product.offer.trim()}`);
      const ribbonText = document.createElement('span');
      ribbonText.textContent = product.offer.trim();
      ribbon.appendChild(ribbonText);
      imageWrap.appendChild(ribbon);
    }
    card.appendChild(imageWrap);

    const details = document.createElement('div');
    details.className = 'product-details';
    const description = document.createElement('div');
    const category = document.createElement('span');
    category.className = 'product-category';
    category.textContent = 'FRESH · MADE WITH LOVE';
    const name = document.createElement('h3');
    const productLink = document.createElement('a');
    productLink.href = `/menu/${encodeURIComponent(product.id)}`;
    productLink.textContent = productName;
    name.appendChild(productLink);
    const productDescription = document.createElement('p');
    productDescription.textContent = formatProductDescription(product.description);
    const price = document.createElement('span');
    price.className = 'product-price';
    price.textContent = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(product.price);
    description.append(category, name, productDescription);
    details.append(description, price);

    const status = document.createElement('p');
    status.className = 'product-stock';
    status.textContent = product.available
      ? 'Freshly available · Please call to order'
      : 'Currently out of stock · Please call for today’s selection';
    const orderButton = document.createElement('button');
    orderButton.className = 'button button-primary product-cta';
    orderButton.type = 'button';
    orderButton.dataset.orderProduct = product.id;
    orderButton.textContent = product.available ? 'Order by phone · 9345065011 →' : 'See today’s availability →';
    card.append(details, status, orderButton);
    productList.appendChild(card);
  }
}

async function loadProducts() {
  try {
    const response = await fetch('/api/products');
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.products)) {
      throw new Error(data.error || 'The menu is unavailable.');
    }
    storefrontProducts = data.products;
    renderProducts();
  } catch (error) {
    productList.textContent = 'We could not load today’s menu. Please call us to check what is available.';
    console.error('Unable to load products:', error);
  }
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
    if (event.data?.type === 'product-catalog') {
      loadProducts();
      return;
    }
    if (event.data?.type === 'product-availability' && typeof event.data.available === 'boolean') {
      loadProducts();
      return;
    }
    if (event.data?.phone === activePhone) fetchWallet({ silent: true, phoneOverride: activePhone });
  });
}

window.addEventListener('storage', (event) => {
  if (event.key === 'inkaniProductCatalogUpdated' && event.newValue) loadProducts();
  if (event.key === 'inkaniProductAvailabilityUpdated' && event.newValue) {
    loadProducts();
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
  if (document.visibilityState === 'visible') loadProducts();
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

const initialPhone = new URLSearchParams(window.location.search).get('phone');
if (initialPhone && normalizedPhone(initialPhone)) {
  const phone = normalizedPhone(initialPhone);
  phoneInput.value = phone;
  fetchWallet({ phoneOverride: phone, promptForRating: true });
} else {
  try {
    const savedPhone = normalizedPhone(localStorage.getItem('inkaniCustomerPhone') || '');
    if (savedPhone) {
      phoneInput.value = savedPhone;
      fetchWallet({ phoneOverride: savedPhone, promptForRating: true });
    } else if (localStorage.getItem('inkaniCustomerPhone')) {
      localStorage.removeItem('inkaniCustomerPhone');
    }
  } catch (error) {
    console.error('Unable to restore the remembered rewards phone number:', error);
  }
}
loadProducts();
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
