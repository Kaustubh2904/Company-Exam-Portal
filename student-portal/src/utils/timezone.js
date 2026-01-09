/**
 * UTC-only timezone utility functions
 * All times displayed in UTC throughout the application
 * IMPORTANT: Backend sends UTC datetime strings - DO NOT convert to UTC again
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
 * Format countdown timer (no timezone label)
 * @param {number} seconds - Seconds remaining
 * @returns {string} Formatted countdown (e.g., "2h 30m")
 */
export const formatCountdown = (seconds) => {
  if (seconds <= 0) return '0m';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

