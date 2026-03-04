import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { LoadoutNode } from '@/types/api';
import { COMPONENT_TYPE_COLORS } from '@/utils/constants';
import { Link } from 'react-router-dom';

interface Props {
  node: LoadoutNode;
  depth?: number;
}

export function LoadoutTree({ node, depth = 0 }: Props) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const compColor = node.component_type
    ? (COMPONENT_TYPE_COLORS[node.component_type] ?? 'text-slate-400')
    : 'text-slate-600';

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-border/40 pl-2' : ''}>
      <div
        className={`flex items-start gap-1.5 px-1.5 py-1 rounded transition-colors ${hasChildren ? 'cursor-pointer hover:bg-white/5' : ''}`}
        onClick={() => hasChildren && setExpanded(e => !e)}
      >
        {/* Expand toggle */}
        <span className="flex-shrink-0 mt-0.5 text-slate-600">
          {hasChildren
            ? expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />
            : <span className="w-2.5 inline-block" />
          }
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Port size */}
            {node.port_max_size != null && node.port_max_size > 0 && (
              <span className="text-xs font-mono-sc text-slate-700">S{node.port_max_size}</span>
            )}
            {/* Port type */}
            <span className="text-xs text-slate-600 font-mono-sc">{node.port_type}</span>
          </div>
          {/* Component */}
          {node.component_uuid ? (
            <Link
              to={`/components/${node.component_uuid}`}
              onClick={e => e.stopPropagation()}
              className={`text-xs ${compColor} hover:underline truncate block transition-colors`}
            >
              {node.component_name}
            </Link>
          ) : (
            <span className="text-xs text-slate-700 italic">— vide —</span>
          )}
        </div>
      </div>

      {/* Children */}
      {expanded && hasChildren && (
        <div>
          {node.children.map((child, i) => (
            <LoadoutTree key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
