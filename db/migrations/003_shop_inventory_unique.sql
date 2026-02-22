-- Migration 003: Add UNIQUE constraint on shop_inventory (shop_id, component_class_name)

-- Remove duplicates first (keep latest by id)
DELETE si FROM shop_inventory si
INNER JOIN (
  SELECT shop_id, component_class_name, MAX(id) as keep_id
  FROM shop_inventory GROUP BY shop_id, component_class_name HAVING COUNT(*) > 1
) dups ON si.shop_id = dups.shop_id AND si.component_class_name = dups.component_class_name AND si.id != dups.keep_id;

ALTER TABLE shop_inventory ADD UNIQUE KEY IF NOT EXISTS uk_shop_component (shop_id, component_class_name);
