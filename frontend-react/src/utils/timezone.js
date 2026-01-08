/**
 * UTC-only timezone utility functions
 * All times displayed in UTC throughout the application
 * IMPORTANT: Backend sends UTC datetime strings - DO NOT convert to UTC again
 * Backend stores in UTC, Frontend displays in UTC
 */

/**
 * Format date in UTC with readable format
 * @param {string|Date} date - Date to format (already in UTC from backend)
 * @returns {string} Formatted date string in UTC (e.g., "07 Jan 2026, 14:30 UTC")
 */
export const formatDateUTC = (date) => {
  if (!date) return 'Not set';
  
  // Backend sends UTC datetime strings (e.g., "2026-01-07T18:00:00" without timezone)
  // We need to treat these numbers as UTC, not local time
  // Solution: Parse the string and reconstruct as UTC
  
  let d;
  if (typeof date === 'string') {
    // Backend sends naive datetime string - treat as UTC
    // Convert to ISO string with 'Z' to force UTC interpretation
    const isoString = date + (date.includes('Z') ? '' : 'Z');
    d = new Date(isoString);
  } else {
    d = date;
  }
  
  // Use UTC methods to get the components (not local time methods)
  const year = d.getUTCFullYear();
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');

  return `${day} ${month} ${year}, ${hours}:${minutes} UTC`;
};

/**
 * Format date in UTC - short format without time
 * @param {string|Date} date - Date to format (already in UTC from backend)
 * @returns {string} Formatted date (e.g., "07 Jan 2026")
 */
export const formatDateOnlyUTC = (date) => {
  if (!date) return 'Not set';
  
  // Backend sends UTC datetime strings - treat as UTC
  let d;
  if (typeof date === 'string') {
    const isoString = date + (date.includes('Z') ? '' : 'Z');
    d = new Date(isoString);
  } else {
    d = date;
  }
  
  const year = d.getUTCFullYear();
  const month = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  const day = String(d.getUTCDate()).padStart(2, '0');

  return `${day} ${month} ${year}`;
};

/**
 * Convert UTC datetime string to datetime-local input format (still UTC)
 * User enters time in UTC, so we display UTC values in the input
 * @param {string} utcDateString - UTC ISO string from backend
 * @returns {string} UTC datetime string for input (YYYY-MM-DDTHH:MM)
 */
export const convertUTCToInput = (utcDateString) => {
  if (!utcDateString) return '';
  
  // Backend sends UTC datetime string - treat as UTC
  let date;
  if (typeof utcDateString === 'string') {
    const isoString = utcDateString + (utcDateString.includes('Z') ? '' : 'Z');
    date = new Date(isoString);
  } else {
    date = utcDateString;
  }

  // Get UTC components (not local) to display in the form
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Convert datetime-local input to UTC ISO string (user enters in UTC)
 * IMPORTANT: datetime-local input always treats the value as LOCAL time
 * So if user enters 23:00 (meaning UTC), we need to interpret it as UTC, not local
 * @param {string} inputDateTimeString - Datetime string from input (YYYY-MM-DDTHH:MM)
 * @returns {string|null} UTC ISO string
 */
export const convertInputToUTC = (inputDateTimeString) => {
  if (!inputDateTimeString) return null;

  // User enters time meaning it as UTC (e.g., "23:00" means "23:00 UTC")
  // But datetime-local input gives us "2026-01-07T23:00" without timezone
  // We must treat these numbers as UTC, not local time
  // Solution: Create a Date object directly from the components in UTC
  
  const [datePart, timePart] = inputDateTimeString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Create UTC date directly using Date.UTC() - this treats numbers as UTC
  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const result = utcDate.toISOString();
  
  console.log('🕐 convertInputToUTC v2.0 - Input:', inputDateTimeString, '→ Output:', result);
  
  return result;
};

/**
 * Get helper text for UTC time
 * @returns {string} Helper text explaining UTC vs IST
 */
export const getUTCHelperText = () => {
  return 'All times are in UTC (5:30 hours behind IST). Example: 14:00 UTC = 7:30 PM IST';
};

/**
 * Format date in user's local timezone
 * @param {string|Date} date - Date to format (already in UTC from backend)
 * @returns {string} Formatted date string in local timezone (e.g., "07 Jan 2026, 20:00")
 */
export const formatDateLocal = (date) => {
  if (!date) return 'N/A';
  
  // Backend sends UTC - parse it and display in local time
  const d = new Date(date);

  const options = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };

  return d.toLocaleString('en-GB', options);
};
