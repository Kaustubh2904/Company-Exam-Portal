// localStorage utilities with synchronization support

const STORAGE_PREFIX = 'cxp_';
const LOCK_TIMEOUT = 5000; // 5 seconds

/**
 * Safe localStorage operations with tab synchronization
 */
class SafeStorage {
  /**
   * Get item from localStorage
   */
  static getItem(key) {
    try {
      const fullKey = STORAGE_PREFIX + key;
      const item = localStorage.getItem(fullKey);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return null;
    }
  }

  /**
   * Set item in localStorage and broadcast change
   */
  static setItem(key, value) {
    try {
      const fullKey = STORAGE_PREFIX + key;
      const jsonValue = JSON.stringify(value);
      localStorage.setItem(fullKey, jsonValue);
      
      // Broadcast storage event to other tabs
      window.dispatchEvent(new StorageEvent('storage', {
        key: fullKey,
        newValue: jsonValue,
        oldValue: localStorage.getItem(fullKey),
        storageArea: localStorage,
        url: window.location.href
      }));
      
      return true;
    } catch (error) {
      console.error('Error writing to localStorage:', error);
      return false;
    }
  }

  /**
   * Remove item from localStorage
   */
  static removeItem(key) {
    try {
      const fullKey = STORAGE_PREFIX + key;
      localStorage.removeItem(fullKey);
      
      // Broadcast removal
      window.dispatchEvent(new StorageEvent('storage', {
        key: fullKey,
        newValue: null,
        oldValue: localStorage.getItem(fullKey),
        storageArea: localStorage,
        url: window.location.href
      }));
      
      return true;
    } catch (error) {
      console.error('Error removing from localStorage:', error);
      return false;
    }
  }

  /**
   * Listen for storage changes from other tabs
   */
  static addChangeListener(key, callback) {
    const fullKey = STORAGE_PREFIX + key;
    
    const handler = (event) => {
      if (event.key === fullKey) {
        const newValue = event.newValue ? JSON.parse(event.newValue) : null;
        callback(newValue);
      }
    };
    
    window.addEventListener('storage', handler);
    
    // Return cleanup function
    return () => window.removeEventListener('storage', handler);
  }

  /**
   * Clear all app-specific localStorage items
   */
  static clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(STORAGE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
      return true;
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      return false;
    }
  }

  /**
   * Detect if multiple tabs are open
   */
  static detectMultipleTabs() {
    const tabId = Date.now().toString();
    const key = STORAGE_PREFIX + 'tab_check';
    
    // Set a temporary value
    localStorage.setItem(key, tabId);
    
    // Read it back immediately
    const readBack = localStorage.getItem(key);
    
    // Clean up
    localStorage.removeItem(key);
    
    // If values don't match, another tab changed it
    return readBack !== tabId;
  }
}

export default SafeStorage;
