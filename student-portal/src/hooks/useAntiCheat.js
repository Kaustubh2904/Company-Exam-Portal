import { useEffect, useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { API_ENDPOINTS } from '../utils/api';

// TEMPORARILY DISABLE ANTICHEAT FOR TESTING
const DISABLE_ANTICHEAT = false;

// Violation thresholds - these are the final values
const VIOLATION_THRESHOLDS = {
  tab_switch: 3,
  fullscreen_exit: 3,
  right_click: 3,
  screenshot: 1,
  copy: null, // Warning only
  paste: null, // Warning only
};

export const useAntiCheat = (onDisqualified, isExamActive) => {
  console.log('useAntiCheat - isExamActive:', isExamActive); // Debug log

  // Local violation tracking
  const [localViolations, setLocalViolations] = useState({
    tab_switch: 0,
    fullscreen_exit: 0,
    right_click: 0,
    screenshot: 0,
    copy: 0,
    paste: 0
  });

  // Track if a violation is currently being processed to avoid race conditions
  const recordingRef = useRef({});
  const fullscreenStateRef = useRef(false);
  const disqualifiedRef = useRef(false); // Track if already disqualified to prevent duplicate alerts

  // Calculate total violations
  const totalViolations = Object.values(localViolations).reduce((sum, count) => sum + count, 0);

  const disqualifyStudent = useCallback(async (violationType, reason) => {
    // Prevent duplicate disqualification calls
    if (disqualifiedRef.current) {
      console.log('Already disqualified, skipping duplicate call');
      return;
    }
    disqualifiedRef.current = true;

    try {
      const token = localStorage.getItem('student_access_token');
      if (!token) {
        console.error('❌ No access token found!');
        return;
      }

      console.log('🚫 Disqualifying student for:', violationType);

      const response = await axios.post(
        API_ENDPOINTS.disqualifyStudent,
        {
          violation_type: violationType,
          reason: reason
        },
        { params: { token }, headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('✅ Disqualification response:', response.data);

      // Show disqualification message ONCE
      toast.error(`You have been disqualified: ${reason}`, {
        autoClose: false, // Keep it visible
        closeOnClick: false
      });

      // Call the disqualification callback after a short delay to ensure toast is visible
      setTimeout(() => {
        onDisqualified(reason);
      }, 1000);

    } catch (error) {
      console.error('Error disqualifying student:', error);
      console.error('Error details:', error.response?.data);
      disqualifiedRef.current = false; // Reset on error
    }
  }, [onDisqualified]);

  const recordViolation = useCallback(
    async (violationType) => {
      // Don't record violations if already disqualified
      if (disqualifiedRef.current) {
        console.log('Already disqualified, skipping violation recording');
        return;
      }

      if (!isExamActive) {
        console.log('Violation not recorded - exam not active');
        return;
      }

      console.log('🔴 Recording violation:', violationType); // Debug log

      // Increment local violation count
      setLocalViolations(prev => {
        const newCount = prev[violationType] + 1;
        const newViolations = { ...prev, [violationType]: newCount };

        console.log(`Violation count updated: ${violationType} = ${newCount}`);

        // Check if threshold exceeded
        const threshold = VIOLATION_THRESHOLDS[violationType];
        if (threshold !== null && newCount >= threshold) {
          console.log(`🚨 Threshold exceeded for ${violationType}: ${newCount} >= ${threshold}`);

          const reason = `Exceeded ${violationType.replace('_', ' ')} limit.`;
          disqualifyStudent(violationType, reason);
        } else {
          // Show warning for violations that haven't exceeded threshold
          if (threshold !== null) {
            const remaining = threshold - newCount;
            console.log(`Remaining attempts: ${remaining}`);

            if (remaining <= 0) {
              const message = `🚨 You have used all ${threshold} allowed ${violationType.replace(
                '_',
                ' '
              )} attempts. Next violation will disqualify you!`;
              console.error(message);
              toast.error(message);
            } else if (remaining > 0) {
              const message = `⚠️ ${violationType.replace(
                '_',
                ' '
              )} detected! ${remaining} attempt(s) remaining.`;
              console.warn(message);
              toast.warning(message);
            }
          } else {
            // Warning only violations
            const message = `⚠️ ${violationType.replace(
              '_',
              ' '
            )} detected! This is being monitored.`;
            console.warn(message);
            toast.info(message);
          }
        }

        return newViolations;
      });

      // Send violation to backend for recording
      try {
        const token = localStorage.getItem('student_access_token');
        if (!token) {
          console.error('❌ No access token found!');
          return;
        }

        console.log('📡 Sending violation to backend...');
        const response = await axios.post(
          API_ENDPOINTS.recordViolation,
          { violation_type: violationType },
          { params: { token }, headers: { Authorization: `Bearer ${token}` } }
        );

        console.log('✅ Violation recorded in backend:', response.data);

      } catch (error) {
        console.error('Error recording violation in backend:', error);
        console.error('Error details:', error.response?.data);
      }
    },
    [isExamActive, disqualifyStudent]
  );

  // Tab switch detection
  useEffect(() => {
    if (DISABLE_ANTICHEAT) {
      console.log('Anti-cheat DISABLED for testing');
      return;
    }

    if (!isExamActive) {
      console.log('Tab switch detection NOT active');
      return;
    }

    console.log('Tab switch detection ACTIVATED');

    let lastHiddenState = document.hidden;
    let visibilityCheckInterval = null;

    const handleVisibilityChange = () => {
      console.log('Visibility change event fired, hidden:', document.hidden);
      if (document.hidden) {
        console.log('Tab switch detected via visibilitychange!');
        recordViolation('tab_switch');
      }
      lastHiddenState = document.hidden;
    };

    const handleWindowBlur = () => {
      console.log('Window blur detected!');
      recordViolation('tab_switch');
    };

    const handleWindowFocus = () => {
      console.log('Window focus detected');
    };

    const handleDocumentFocus = () => {
      console.log('Document focus detected');
    };

    const handleDocumentBlur = () => {
      console.log('Document blur detected!');
      recordViolation('tab_switch');
    };

    const checkVisibilityStatus = () => {
      const currentlyHidden = document.hidden;
      if (!lastHiddenState && currentlyHidden) {
        console.log('Tab switch detected via periodic visibility check!');
        recordViolation('tab_switch');
      }
      lastHiddenState = currentlyHidden;
    };

    // Multiple event listeners for better detection
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('focus', handleDocumentFocus);
    document.addEventListener('blur', handleDocumentBlur);

    // Check visibility status every 1 second
    visibilityCheckInterval = setInterval(checkVisibilityStatus, 1000);

    return () => {
      console.log('Tab switch detection DEACTIVATED');
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('focus', handleDocumentFocus);
      document.removeEventListener('blur', handleDocumentBlur);
      if (visibilityCheckInterval) {
        clearInterval(visibilityCheckInterval);
      }
    };
  }, [recordViolation, isExamActive]);

  // Fullscreen exit detection
  useEffect(() => {
    if (DISABLE_ANTICHEAT) return;
    if (!isExamActive) return;

    let fullscreenExitTimeout = null;
    let currentFullscreenState = !!document.fullscreenElement;
    let fullscreenCheckInterval = null;

    const handleFullscreenChange = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      console.log(
        'Fullscreen change event, currently fullscreen:',
        isCurrentlyFullscreen
      );

      // Only record violation if we're EXITING fullscreen (was fullscreen, now not)
      if (currentFullscreenState && !isCurrentlyFullscreen) {
        console.log('Fullscreen exit detected via event!');
        recordViolation('fullscreen_exit');

        // Give user 3 seconds to return to fullscreen before showing prompt
        fullscreenExitTimeout = setTimeout(() => {
          const reEnter = window.confirm(
            '⚠️ You have exited fullscreen mode.\n\n' +
              'This is a violation. Click OK to return to fullscreen mode.'
          );
          if (reEnter) {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
              elem.requestFullscreen().catch((err) => {
                console.log('Failed to re-enter fullscreen:', err);
              });
            }
          }
        }, 3000);
      } else if (!currentFullscreenState && isCurrentlyFullscreen) {
        // User returned to fullscreen, cancel the prompt
        console.log('Returned to fullscreen, canceling prompt');
        if (fullscreenExitTimeout) {
          clearTimeout(fullscreenExitTimeout);
          fullscreenExitTimeout = null;
        }
      }

      // Update current state
      currentFullscreenState = isCurrentlyFullscreen;
    };

    const checkFullscreenStatus = () => {
      const isCurrentlyFullscreen = !!document.fullscreenElement;
      if (currentFullscreenState && !isCurrentlyFullscreen) {
        console.log('Fullscreen exit detected via periodic check!');
        recordViolation('fullscreen_exit');
        currentFullscreenState = isCurrentlyFullscreen;
      } else if (!currentFullscreenState && isCurrentlyFullscreen) {
        console.log('Returned to fullscreen via periodic check');
        currentFullscreenState = isCurrentlyFullscreen;
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Check fullscreen status every 1 second
    fullscreenCheckInterval = setInterval(checkFullscreenStatus, 1000);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (fullscreenExitTimeout) {
        clearTimeout(fullscreenExitTimeout);
      }
      if (fullscreenCheckInterval) {
        clearInterval(fullscreenCheckInterval);
      }
    };
  }, [recordViolation, isExamActive]);

  // Right-click prevention
  useEffect(() => {
    if (DISABLE_ANTICHEAT) return;
    if (!isExamActive) return;

    const handleContextMenu = (e) => {
      e.preventDefault();
      recordViolation('right_click');
      return false;
    };

    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [recordViolation, isExamActive]);

  // Screenshot detection (keyboard shortcuts)
  useEffect(() => {
    if (DISABLE_ANTICHEAT) return;
    if (!isExamActive) return;

    const handleKeyDown = (e) => {
      // Print Screen
      if (e.key === 'PrintScreen') {
        recordViolation('screenshot');
        e.preventDefault();
      }

      // Windows Snipping Tool (Win + Shift + S)
      if (e.key === 's' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        recordViolation('screenshot');
        e.preventDefault();
      }

      // Mac screenshot shortcuts
      if (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) {
        recordViolation('screenshot');
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [recordViolation, isExamActive]);

  // Copy detection
  useEffect(() => {
    if (DISABLE_ANTICHEAT) return;
    if (!isExamActive) return;

    const handleCopy = (e) => {
      recordViolation('copy');
      // Don't prevent - just record
    };

    document.addEventListener('copy', handleCopy);

    return () => {
      document.removeEventListener('copy', handleCopy);
    };
  }, [recordViolation, isExamActive]);

  // Paste detection
  useEffect(() => {
    if (DISABLE_ANTICHEAT) return;
    if (!isExamActive) return;

    const handlePaste = (e) => {
      recordViolation('paste');
      // Don't prevent - just record
    };

    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [recordViolation, isExamActive]);

  const requestFullscreen = () => {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err) => {
        console.log('Fullscreen request failed:', err);
      });
    }
  };

  return { requestFullscreen, localViolations, totalViolations };
};
