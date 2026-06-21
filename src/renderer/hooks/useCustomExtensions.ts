import { useCallback, useEffect, useRef, useState } from 'react';
import { resetPluginExtensions } from '../pluginApi';

export interface LoadedExtensions {
  scripts: string[];
  styles: string[];
}

export function useCustomExtensions(): LoadedExtensions {
  const cleanupRef = useRef<() => void>(() => undefined);
  const [loaded, setLoaded] = useState<LoadedExtensions>({ scripts: [], styles: [] });

  const refresh = useCallback(async () => {
    const info = await window.auralis.getCustomizationInfo();
    cleanupRef.current();
    resetPluginExtensions();
    const elements: HTMLElement[] = [];
    const urls: string[] = [];

    for (const style of info.styles) {
      const element = document.createElement('style');
      element.dataset.auralisCustomStyle = style.name;
      element.textContent = style.css;
      document.head.appendChild(element);
      elements.push(element);
    }
    for (const script of info.scripts) {
      const url = URL.createObjectURL(new Blob([`${script.code}\n//# sourceURL=auralis-extension://${script.name}`], { type: 'text/javascript' }));
      const element = document.createElement('script');
      element.type = 'module';
      element.src = url;
      element.dataset.auralisCustomScript = script.name;
      element.addEventListener('error', () => console.error(`[Auralis extension] Failed to load ${script.name}`));
      document.head.appendChild(element);
      elements.push(element);
      urls.push(url);
    }
    cleanupRef.current = () => {
      elements.forEach((element) => element.remove());
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
    setLoaded({ scripts: info.scripts.map((item) => item.name), styles: info.styles.map((item) => item.name) });
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = window.auralis.onCustomizationChanged(() => void refresh());
    return () => {
      unsubscribe();
      cleanupRef.current();
      resetPluginExtensions();
    };
  }, [refresh]);

  return loaded;
}
