/**
 * LoadoutParser — Extracts default vehicle loadout entries from DataForge records.
 * Decoupled from DataForgeService via the DataForgeContext interface.
 */
import { classifyPort, type DataForgeContext } from './dataforge-utils.js';

export interface LoadoutPortEntry {
  portName: string;
  portType?: string;
  componentClassName?: string | null;
  minSize?: number;
  maxSize?: number;
  children?: LoadoutPortEntry[];
}

export class LoadoutParser {
  constructor(private ctx: DataForgeContext) {}

  extractVehicleLoadout(className: string): LoadoutPortEntry[] | null {
    const dfData = this.ctx.getDfData();
    if (!dfData) return null;
    const record = this.ctx.findEntityRecord(className);
    if (!record) return null;
    const data = this.ctx.readInstance(record.structIndex, record.instanceIndex, 0, 8);
    if (!data || !Array.isArray(data.Components)) return null;

    // Build port metadata map for min/max size from SItemPortContainerComponentParams
    const portMetaMap = new Map<string, { minSize: number; maxSize: number }>();
    for (const comp of data.Components) {
      if (!comp || (comp.__type !== 'SItemPortContainerComponentParams' && comp.__type !== 'VehicleComponentParams')) continue;
      const ports = comp.Ports || comp.ports;
      if (!Array.isArray(ports)) continue;
      for (const portDef of ports) {
        if (!portDef || typeof portDef !== 'object') continue;
        const pName = (portDef.Name || portDef.name || '').toLowerCase();
        if (!pName) continue;
        portMetaMap.set(pName, {
          minSize: typeof portDef.MinSize === 'number' ? portDef.MinSize : 0,
          maxSize: typeof portDef.MaxSize === 'number' ? portDef.MaxSize : 0,
        });
      }
    }

    const mainEntries = this.extractLoadoutEntries(data);
    const variantMap: Map<string, string> | null = this.findVariantLoadoutMap(className);

    const loadoutItems: any[] = [];
    const processedPorts = new Set<string>();

    const processEntry = (
      portName: string,
      entClassName: string,
      inlineChildren?: Array<{ portName: string; entityClassName: string; children?: any[] }>,
      depth = 0,
      parentPath = '',
    ): any => {
      const fullPath = parentPath ? `${parentPath}/${portName}` : portName;
      if (!entClassName && variantMap) entClassName = variantMap.get(fullPath) || variantMap.get(portName) || '';
      const item: any = { portName, componentClassName: entClassName || null, portType: classifyPort(portName, entClassName) };
      const meta = portMetaMap.get(portName.toLowerCase());
      if (meta) {
        item.minSize = meta.minSize;
        item.maxSize = meta.maxSize;
      }
      if (depth >= 5) return item;
      const children: any[] = [];
      if (inlineChildren && inlineChildren.length > 0) {
        for (const child of inlineChildren) {
          if (!child.portName) continue;
          children.push(processEntry(child.portName, child.entityClassName || '', child.children, depth + 1, fullPath));
        }
      }
      if (children.length === 0 && entClassName) {
        const subRecord = this.ctx.findEntityRecord(entClassName);
        if (subRecord) {
          const subData = this.ctx.readInstance(subRecord.structIndex, subRecord.instanceIndex, 0, 5);
          if (subData && Array.isArray(subData.Components)) {
            for (const subComp of subData.Components) {
              if (!subComp || subComp.__type !== 'SEntityComponentDefaultLoadoutParams') continue;
              const subEntries = subComp.loadout?.entries;
              if (!Array.isArray(subEntries)) continue;
              for (const se of subEntries) {
                let subEntClassName = se.entityClassName || '';
                if (!subEntClassName && se.entityClassReference?.__ref)
                  subEntClassName = this.ctx.resolveGuid(se.entityClassReference.__ref) || '';
                if (!subEntClassName && variantMap)
                  subEntClassName =
                    variantMap.get(`${fullPath}/${se.itemPortName}`) || variantMap.get(`${portName}/${se.itemPortName}`) || '';
                if (se.itemPortName && subEntClassName) {
                  const subInline: Array<{ portName: string; entityClassName: string; children?: any[] }> = [];
                  if (se.loadout?.entries && Array.isArray(se.loadout.entries)) {
                    for (const ssl of se.loadout.entries) {
                      let sslCN = ssl.entityClassName || '';
                      if (!sslCN && ssl.entityClassReference?.__ref) sslCN = this.ctx.resolveGuid(ssl.entityClassReference.__ref) || '';
                      if (ssl.itemPortName && sslCN) {
                        const subSubInline: Array<{ portName: string; entityClassName: string }> = [];
                        if (Array.isArray(ssl.loadout?.entries)) {
                          for (const sssl of ssl.loadout.entries) {
                            let ssslCN = sssl.entityClassName || '';
                            if (!ssslCN && sssl.entityClassReference?.__ref)
                              ssslCN = this.ctx.resolveGuid(sssl.entityClassReference.__ref) || '';
                            if (sssl.itemPortName && ssslCN) subSubInline.push({ portName: sssl.itemPortName, entityClassName: ssslCN });
                          }
                        }
                        subInline.push({
                          portName: ssl.itemPortName,
                          entityClassName: sslCN,
                          children: subSubInline.length > 0 ? subSubInline : undefined,
                        });
                      }
                    }
                  }
                  children.push(
                    processEntry(se.itemPortName, subEntClassName, subInline.length > 0 ? subInline : undefined, depth + 1, fullPath),
                  );
                }
              }
            }
          }
        }
      }
      if (children.length > 0) item.children = children;
      return item;
    };

    for (const entry of mainEntries) {
      const portName = entry.portName;
      let entClassName = entry.entityClassName || '';
      if (!portName) continue;
      if (!entClassName && variantMap) entClassName = variantMap.get(portName) || '';
      loadoutItems.push(processEntry(portName, entClassName, entry.children, 0, ''));
      processedPorts.add(portName);
    }

    if (variantMap) {
      for (const [portName, entClassName] of variantMap) {
        if (portName.includes('/') || processedPorts.has(portName)) continue;
        const portType = classifyPort(portName, entClassName);
        if (['WeaponGun', 'Turret', 'MissileRack', 'Gimbal', 'Weapon'].includes(portType)) {
          loadoutItems.push(processEntry(portName, entClassName, undefined, 0, ''));
          processedPorts.add(portName);
        }
      }
    }

    return loadoutItems.length > 0 ? loadoutItems : null;
  }

  private extractLoadoutEntries(data: any): Array<{ portName: string; entityClassName: string; children?: any[] }> {
    if (!data || !Array.isArray(data.Components)) return [];

    const parseEntries = (rawEntries: any[]): any[] => {
      const result: any[] = [];
      for (const e of rawEntries) {
        let className = e.entityClassName || '';
        if (!className && e.entityClassReference?.__ref) className = this.ctx.resolveGuid(e.entityClassReference.__ref) || '';
        const entry: any = { portName: e.itemPortName || '', entityClassName: className };
        if (Array.isArray(e.loadout?.entries) && e.loadout.entries.length > 0) {
          const children = parseEntries(e.loadout.entries);
          if (children.length > 0) entry.children = children;
        }
        result.push(entry);
      }
      return result;
    };

    const entries: any[] = [];
    for (const comp of data.Components) {
      if (!comp || comp.__type !== 'SEntityComponentDefaultLoadoutParams') continue;
      const items = comp.loadout?.entries;
      if (!Array.isArray(items)) continue;
      entries.push(...parseEntries(items));
    }
    return entries;
  }

  private findVariantLoadoutMap(className: string): Map<string, string> | null {
    const dfData = this.ctx.getDfData();
    if (!dfData) return null;
    const suffixes = ['_PU_AI_UEE', '_PU_AI_SEC', '_PU_AI_CIV', '_PU_AI', '_PU', '_Template'];
    const entityClassIdx = dfData.structDefs.findIndex((s) => s.name === 'EntityClassDefinition');
    if (entityClassIdx === -1) return null;
    for (const suffix of suffixes) {
      const variantName = className + suffix;
      let varRecord: any = null;
      for (const r of dfData.records) {
        if (r.structIndex === entityClassIdx) {
          const name = r.name?.replace('EntityClassDefinition.', '') || '';
          if (name === variantName) {
            varRecord = r;
            break;
          }
        }
      }
      if (!varRecord) continue;
      try {
        const varData = this.ctx.readInstance(varRecord.structIndex, varRecord.instanceIndex, 0, 8);
        if (!varData || !Array.isArray(varData.Components)) continue;
        const map = new Map<string, string>();
        for (const comp of varData.Components) {
          if (!comp || comp.__type !== 'SEntityComponentDefaultLoadoutParams') continue;
          const entries = comp.loadout?.entries;
          if (!Array.isArray(entries)) continue;
          for (const e of entries) {
            const portName = e.itemPortName || '';
            let entityName = e.entityClassName || '';
            if (!entityName && e.entityClassReference?.__ref) entityName = this.ctx.resolveGuid(e.entityClassReference.__ref) || '';
            if (portName && entityName) {
              map.set(portName, entityName);
              if (Array.isArray(e.loadout?.entries)) {
                for (const sub of e.loadout.entries) {
                  let subName = sub.entityClassName || '';
                  if (!subName && sub.entityClassReference?.__ref) subName = this.ctx.resolveGuid(sub.entityClassReference.__ref) || '';
                  if (sub.itemPortName && subName) {
                    map.set(`${portName}/${sub.itemPortName}`, subName);
                    if (Array.isArray(sub.loadout?.entries)) {
                      for (const subsub of sub.loadout.entries) {
                        let subsubName = subsub.entityClassName || '';
                        if (!subsubName && subsub.entityClassReference?.__ref)
                          subsubName = this.ctx.resolveGuid(subsub.entityClassReference.__ref) || '';
                        if (subsub.itemPortName && subsubName)
                          map.set(`${portName}/${sub.itemPortName}/${subsub.itemPortName}`, subsubName);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        if (map.size > 0) {
          return map;
        }
      } catch {}
    }
    return null;
  }
}
