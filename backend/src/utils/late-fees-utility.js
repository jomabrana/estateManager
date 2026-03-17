// backend/src/utils/late-fees-utility.js
// Late fee calculation and management logic

/**
 * Calculate late fee for a single invoice month
 * @param {number} baseAmount - Base invoice amount
 * @param {number} daysOverdue - Days past due date
 * @param {object} config - Estate late fee config
 * @returns {number} Calculated late fee amount (0 if not applicable)
 */
function calculateLateFee(baseAmount, daysOverdue, config) {
  // Check if late fee should be applied
  if (!config.lateFeeEnabled) {
    return 0;
  }

  if (daysOverdue < config.lateFeeKickInAfterDays) {
    return 0; // Not yet overdue enough
  }

  let feeAmount = 0;

  // Calculate fee based on type
  if (config.lateFeeType === 'PERCENTAGE') {
    feeAmount = baseAmount * (config.lateFeeValue / 100);
  } else if (config.lateFeeType === 'FIXED') {
    feeAmount = config.lateFeeValue;
  }

  // Apply maximum cap if set
  if (config.lateFeeMaxCap && feeAmount > config.lateFeeMaxCap) {
    feeAmount = config.lateFeeMaxCap;
  }

  return Math.round(feeAmount * 100) / 100; // Round to 2 decimals
}

/**
 * Calculate days overdue from due date to today
 * @param {Date} dueDate - Due date
 * @returns {number} Days overdue (0 if not overdue yet)
 */
function calculateDaysOverdue(dueDate) {
  const now = new Date();
  const dueDateObj = new Date(dueDate);

  // Remove time component for accurate day calculation
  now.setHours(0, 0, 0, 0);
  dueDateObj.setHours(0, 0, 0, 0);

  const timeDiff = now - dueDateObj;
  const daysOverdue = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

  return Math.max(0, daysOverdue); // Return 0 if not overdue
}

/**
 * Format date to YYYY-MM-DD
 * @param {Date} date 
 * @returns {string}
 */
function formatDate(date) {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Format currency (KES)
 * @param {number} amount 
 * @returns {string}
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0
  }).format(amount);
}

module.exports = {
  calculateLateFee,
  calculateDaysOverdue,
  formatDate,
  formatCurrency
};