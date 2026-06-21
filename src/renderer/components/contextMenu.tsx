import { useEffect } from 'react';
import type { ContextMenuAction } from '../../shared/types';

interface ContextMenuProps {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onAction: (id: string) => void;
  onClose: () => void;
}

export function ContextMenu(props: ContextMenuProps) {
  useEffect(() => {
    const close = () => props.onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [props]);

  return (
    <div className="context-menu" style={{ left: props.x, top: props.y }} role="menu">
      {props.actions.map((action) => (
        <button
          key={action.id}
          role="menuitem"
          disabled={action.disabled}
          onClick={(event) => {
            event.stopPropagation();
            props.onAction(action.id);
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

