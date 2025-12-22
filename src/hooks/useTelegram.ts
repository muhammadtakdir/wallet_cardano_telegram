"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Telegram WebApp user data
 */
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

/**
 * Telegram WebApp theme parameters
 */
export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
}

/**
 * Telegram environment state
 */
export interface TelegramState {
  isInTelegram: boolean;
  isReady: boolean;
  user: TelegramUser | null;
  themeParams: TelegramThemeParams;
  colorScheme: "light" | "dark";
  platform: string;
  version: string;
  viewportHeight: number;
  viewportStableHeight: number;
  isExpanded: boolean;
}

/**
 * Telegram WebApp actions
 */
export interface TelegramActions {
  ready: () => void;
  expand: () => void;
  close: () => void;
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
  showPopup: (params: {
    title?: string;
    message: string;
    buttons?: Array<{
      id?: string;
      type?: "default" | "ok" | "close" | "cancel" | "destructive";
      text: string;
    }>;
  }) => Promise<string>;
  hapticFeedback: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  sendData: (data: string) => void;
}

/**
 * Default state when not in Telegram
 */
const defaultState: TelegramState = {
  isInTelegram: false,
  isReady: false,
  user: null,
  themeParams: {},
  colorScheme: "light",
  platform: "unknown",
  version: "0.0",
  viewportHeight: 0,
  viewportStableHeight: 0,
  isExpanded: false,
};

/**
 * Hook to interact with Telegram WebApp
 * 
 * Provides:
 * - Environment detection (Telegram vs Browser)
 * - User data access
 * - Theme synchronization
 * - Native Telegram features (haptics, popups, etc.)
 */
export const useTelegram = (): TelegramState & TelegramActions => {
  const [state, setState] = useState<TelegramState>(defaultState);
  const [webApp, setWebApp] = useState<typeof window.Telegram.WebApp | null>(null);

  // Initialize Telegram WebApp
  useEffect(() => {
    const initTelegram = async () => {
      // Check if running in Telegram WebApp
      if (typeof window !== "undefined" && window.Telegram?.WebApp) {
        const tg = window.Telegram.WebApp;
        setWebApp(tg);

        // Update state with Telegram data
        setState({
          isInTelegram: true,
          isReady: true,
          user: tg.initDataUnsafe?.user || null,
          themeParams: tg.themeParams || {},
          colorScheme: tg.colorScheme || "light",
          platform: tg.platform || "unknown",
          version: tg.version || "0.0",
          viewportHeight: tg.viewportHeight || window.innerHeight,
          viewportStableHeight: tg.viewportStableHeight || window.innerHeight,
          isExpanded: tg.isExpanded || false,
        });

        // Listen for theme changes
        tg.onEvent("themeChanged", () => {
          setState((prev) => ({
            ...prev,
            themeParams: tg.themeParams || {},
            colorScheme: tg.colorScheme || "light",
          }));
        });

        // Listen for viewport changes
        tg.onEvent("viewportChanged", () => {
          setState((prev) => ({
            ...prev,
            viewportHeight: tg.viewportHeight,
            viewportStableHeight: tg.viewportStableHeight,
            isExpanded: tg.isExpanded,
          }));
        });
      } else {
        // Not in Telegram - running in standard browser
        setState({
          ...defaultState,
          viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
          viewportStableHeight: typeof window !== "undefined" ? window.innerHeight : 0,
        });
      }
    };

    initTelegram();
  }, []);

  // Telegram WebApp actions
  const ready = useCallback(() => {
    webApp?.ready();
  }, [webApp]);

  const expand = useCallback(() => {
    webApp?.expand();
  }, [webApp]);

  const close = useCallback(() => {
    webApp?.close();
  }, [webApp]);

  const showAlert = useCallback(
    (message: string): Promise<void> => {
      return new Promise((resolve) => {
        if (webApp) {
          webApp.showAlert(message, resolve);
        } else {
          alert(message);
          resolve();
        }
      });
    },
    [webApp]
  );

  const showConfirm = useCallback(
    (message: string): Promise<boolean> => {
      return new Promise((resolve) => {
        if (webApp) {
          webApp.showConfirm(message, resolve);
        } else {
          resolve(confirm(message));
        }
      });
    },
    [webApp]
  );

  const showPopup = useCallback(
    (params: {
      title?: string;
      message: string;
      buttons?: Array<{
        id?: string;
        type?: "default" | "ok" | "close" | "cancel" | "destructive";
        text: string;
      }>;
    }): Promise<string> => {
      return new Promise((resolve) => {
        if (webApp) {
          webApp.showPopup(params, (buttonId: string) => resolve(buttonId));
        } else {
          alert(params.message);
          resolve("ok");
        }
      });
    },
    [webApp]
  );

  const hapticFeedback = {
    impactOccurred: useCallback(
      (style: "light" | "medium" | "heavy" | "rigid" | "soft") => {
        webApp?.HapticFeedback?.impactOccurred(style);
      },
      [webApp]
    ),
    notificationOccurred: useCallback(
      (type: "error" | "success" | "warning") => {
        webApp?.HapticFeedback?.notificationOccurred(type);
      },
      [webApp]
    ),
    selectionChanged: useCallback(() => {
      webApp?.HapticFeedback?.selectionChanged();
    }, [webApp]),
  };

  const setHeaderColor = useCallback(
    (color: string) => {
      webApp?.setHeaderColor(color);
    },
    [webApp]
  );

  const setBackgroundColor = useCallback(
    (color: string) => {
      webApp?.setBackgroundColor(color);
    },
    [webApp]
  );

  const enableClosingConfirmation = useCallback(() => {
    webApp?.enableClosingConfirmation();
  }, [webApp]);

  const disableClosingConfirmation = useCallback(() => {
    webApp?.disableClosingConfirmation();
  }, [webApp]);

  const openLink = useCallback(
    (url: string) => {
      if (webApp) {
        webApp.openLink(url);
      } else {
        window.open(url, "_blank");
      }
    },
    [webApp]
  );

  const openTelegramLink = useCallback(
    (url: string) => {
      if (webApp) {
        webApp.openTelegramLink(url);
      } else {
        window.open(url, "_blank");
      }
    },
    [webApp]
  );

  const sendData = useCallback(
    (data: string) => {
      webApp?.sendData(data);
    },
    [webApp]
  );

  return {
    ...state,
    ready,
    expand,
    close,
    showAlert,
    showConfirm,
    showPopup,
    hapticFeedback,
    setHeaderColor,
    setBackgroundColor,
    enableClosingConfirmation,
    disableClosingConfirmation,
    openLink,
    openTelegramLink,
    sendData,
  };
};

/**
 * Simple hook to check if running in Telegram
 */
export const useIsTelegram = (): boolean => {
  const [isInTelegram, setIsInTelegram] = useState(false);

  useEffect(() => {
    setIsInTelegram(
      typeof window !== "undefined" && !!window.Telegram?.WebApp
    );
  }, []);

  return isInTelegram;
};

// Type declarations for Telegram WebApp
declare global {
  interface Window {
    Telegram: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        initDataUnsafe: {
          user?: TelegramUser;
          query_id?: string;
          auth_date?: number;
          hash?: string;
        };
        themeParams: TelegramThemeParams;
        colorScheme: "light" | "dark";
        platform: string;
        version: string;
        viewportHeight: number;
        viewportStableHeight: number;
        isExpanded: boolean;
        showAlert: (message: string, callback?: () => void) => void;
        showConfirm: (message: string, callback: (confirmed: boolean) => void) => void;
        showPopup: (
          params: {
            title?: string;
            message: string;
            buttons?: Array<{
              id?: string;
              type?: string;
              text: string;
            }>;
          },
          callback: (buttonId: string) => void
        ) => void;
        HapticFeedback: {
          impactOccurred: (style: string) => void;
          notificationOccurred: (type: string) => void;
          selectionChanged: () => void;
        };
        setHeaderColor: (color: string) => void;
        setBackgroundColor: (color: string) => void;
        enableClosingConfirmation: () => void;
        disableClosingConfirmation: () => void;
        openLink: (url: string) => void;
        openTelegramLink: (url: string) => void;
        sendData: (data: string) => void;
        onEvent: (event: string, callback: () => void) => void;
        offEvent: (event: string, callback: () => void) => void;
      };
    };
  }
}
