-- The id, created_at and updated_at columns of existing collections become fields, listed first.
-- Their ids were random strings. New collections start without fields.
UPDATE `fields` SET `position` = `position` + 3;
--> statement-breakpoint
INSERT INTO `fields` (`id`, `collection_id`, `name`, `type`, `required`, `unique`, `options`, `system`, `position`, `created_at`)
SELECT lower(hex(randomblob(16))), `c`.`id`, `d`.`name`, `d`.`type`, 0, 0, `d`.`options`, `c`.`system`, `d`.`position`, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
FROM `collections` AS `c`
CROSS JOIN (
	SELECT 'id' AS `name`, 'id' AS `type`, '{"generator":"random"}' AS `options`, 0 AS `position`
	UNION ALL SELECT 'created_at', 'created', '{}', 1
	UNION ALL SELECT 'updated_at', 'updated', '{}', 2
) AS `d`
WHERE NOT EXISTS (
	SELECT 1 FROM `fields` AS `f` WHERE `f`.`collection_id` = `c`.`id` AND `f`.`name` = `d`.`name`
);
