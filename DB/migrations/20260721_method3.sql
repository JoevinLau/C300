CREATE TABLE IF NOT EXISTS ceda_dataset_versions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    version_code VARCHAR(64) NOT NULL,
    release_date DATE NULL,
    raw_factor_year SMALLINT UNSIGNED NOT NULL,
    reference_price_year SMALLINT UNSIGNED NOT NULL,
    currency_code CHAR(3) NOT NULL DEFAULT 'SGD',
    price_basis ENUM('purchaser_price', 'producer_price') NOT NULL DEFAULT 'purchaser_price',
    source_name VARCHAR(128) NOT NULL DEFAULT 'Open CEDA',
    source_file_sha256 CHAR(64) NOT NULL,
    source_license VARCHAR(64) NOT NULL DEFAULT 'CC BY-SA 4.0',
    attribution VARCHAR(255) NOT NULL DEFAULT 'CEDA by Watershed',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    imported_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ceda_dataset_version_basis (version_code, reference_price_year, currency_code, price_basis),
    KEY idx_ceda_dataset_active (is_active),
    CONSTRAINT chk_ceda_dataset_currency CHECK (currency_code REGEXP '^[A-Z]{3}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ceda_countries (
    country_code CHAR(3) NOT NULL,
    country_name VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (country_code),
    UNIQUE KEY uq_ceda_country_name (country_name),
    CONSTRAINT chk_ceda_country_code CHECK (country_code REGEXP '^[A-Z]{3}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ceda_sectors (
    sector_code VARCHAR(32) NOT NULL,
    sector_name VARCHAR(500) NOT NULL,
    naics_code VARCHAR(32) NULL,
    sector_description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (sector_code),
    KEY idx_ceda_sector_naics (naics_code),
    FULLTEXT KEY ft_ceda_sector_name (sector_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ceda_emission_factors (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dataset_version_id BIGINT UNSIGNED NOT NULL,
    country_code CHAR(3) NOT NULL,
    sector_code VARCHAR(32) NOT NULL,
    reference_price_year SMALLINT UNSIGNED NOT NULL,
    currency_code CHAR(3) NOT NULL,
    price_basis ENUM('purchaser_price', 'producer_price') NOT NULL,
    factor_value DECIMAL(20,10) NOT NULL,
    factor_unit VARCHAR(32) NOT NULL DEFAULT 'kgCO2e/SGD',
    raw_factor_value DECIMAL(20,10) NULL,
    purchaser_conversion DECIMAL(20,10) NULL,
    sector_price_index DECIMAL(20,10) NULL,
    exchange_rate_lcu_per_usd DECIMAL(20,10) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_ceda_emission_factor (dataset_version_id, country_code, sector_code, reference_price_year, currency_code, price_basis),
    KEY idx_ceda_factor_lookup (country_code, sector_code, reference_price_year),
    CONSTRAINT fk_ceda_factor_dataset FOREIGN KEY (dataset_version_id)
        REFERENCES ceda_dataset_versions (id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_ceda_factor_country FOREIGN KEY (country_code)
        REFERENCES ceda_countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_ceda_factor_sector FOREIGN KEY (sector_code)
        REFERENCES ceda_sectors (sector_code) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_ceda_factor_value CHECK (factor_value >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS method3_purchase_types (
    purchase_type_code VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    price_index_type VARCHAR(64) NOT NULL,
    price_index_label VARCHAR(255) NOT NULL,
    display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (purchase_type_code),
    KEY idx_method3_purchase_type_index (price_index_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS singapore_price_indices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    index_type VARCHAR(64) NOT NULL,
    index_label VARCHAR(255) NOT NULL,
    year SMALLINT UNSIGNED NOT NULL,
    month TINYINT UNSIGNED NOT NULL,
    index_value DECIMAL(18,8) NOT NULL,
    base_year SMALLINT UNSIGNED NOT NULL,
    source VARCHAR(255) NOT NULL,
    resource_id VARCHAR(32) NOT NULL,
    retrieved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_provisional BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    UNIQUE KEY uq_singapore_price_index_period (index_type, year, month),
    KEY idx_singapore_price_index_year (index_type, year),
    CONSTRAINT chk_singapore_price_index_month CHECK (month BETWEEN 1 AND 12),
    CONSTRAINT chk_singapore_price_index_value CHECK (index_value > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO method3_purchase_types
    (purchase_type_code, display_name, price_index_type, price_index_label, display_order)
VALUES
    ('imported_raw_material', 'Imported Raw Material', 'import_manufactured_goods', 'Import Price Index - Manufactured Goods', 1),
    ('local_processing', 'Local Processing / Surface Treatment', 'domestic_supply_manufactured_goods', 'Domestic Supply Price Index - Manufactured Goods', 2),
    ('overseas_processing', 'Overseas Processing / Surface Treatment', 'import_manufactured_goods', 'Import Price Index - Manufactured Goods', 3)
ON DUPLICATE KEY UPDATE
    display_name = VALUES(display_name),
    price_index_type = VALUES(price_index_type),
    price_index_label = VALUES(price_index_label),
    display_order = VALUES(display_order),
    is_active = TRUE;
