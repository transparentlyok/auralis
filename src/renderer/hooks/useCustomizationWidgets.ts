import { useCallback, useEffect, useState } from 'react';
import type { CustomWidgetDefinition } from '../../shared/types';

export function useCustomizationWidgets() {
  const [widgets, setWidgets] = useState<CustomWidgetDefinition[]>([]);
  const refresh = useCallback(async () => {
    const info = await window.auralis.getCustomizationInfo();
    setWidgets(info.widgets);
  }, []);

  useEffect(() => {
    void refresh();
    return window.auralis.onCustomizationChanged(() => void refresh());
  }, [refresh]);

  return { customWidgets: widgets, refreshCustomWidgets: refresh };
}
