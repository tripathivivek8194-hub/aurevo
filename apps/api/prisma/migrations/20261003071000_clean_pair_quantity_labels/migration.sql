-- Clean up pair-based quantity labels after the bulk product-name migration.
WITH updates(sku, new_name) AS (
  VALUES
    ('AE-3256803876569442', 'Japanese Non-slip Chopsticks (5 pairs / 10 pcs)'),
    ('AE-3256804287465676', 'PSP LR Replacement Keys (1 pair / 2 pcs)'),
    ('AE-3256802715083318', 'Ceramic Bicycle Disc Brake Pads (4 pairs / 8 pcs)'),
    ('AE-3256806769010197', 'Motorcycle Scooter Handlebar Grips (1 pair / 2 pcs)'),
    ('AE-3256804402209025', 'Steering Wheel Shift Paddles (1 pair / 2 pcs)'),
    ('AE-3256803058067735', 'Carbon Bicycle Handlebar Ends (1 pair / 2 pcs)'),
    ('AE-3256805747989255', 'Bamboo Non-slip Chopsticks (5 pairs / 10 pcs)'),
    ('AE-1005009446686828', 'Dual-band Wi-Fi Antennas (1 pair / 2 pcs)')
)
UPDATE "products" AS product
SET
  "name" = updates.new_name,
  "updatedAt" = CURRENT_TIMESTAMP
FROM updates
WHERE product."sku" = updates.sku;
