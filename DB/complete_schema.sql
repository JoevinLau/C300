USE defaultdb;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS method2_machine_profiles;
DROP TABLE IF EXISTS method2_surface_treatment_factors;
DROP TABLE IF EXISTS method2_transport_emission_factors;
DROP TABLE IF EXISTS method2_grid_electricity_factors;
DROP TABLE IF EXISTS method2_material_emission_factors;
DROP TABLE IF EXISTS singapore_price_indices;
DROP TABLE IF EXISTS method3_purchase_types;
DROP TABLE IF EXISTS ceda_emission_factors;
DROP TABLE IF EXISTS ceda_sectors;
DROP TABLE IF EXISTS ceda_countries;
DROP TABLE IF EXISTS ceda_dataset_versions;
DROP TABLE IF EXISTS ceda_spend_emission_factors;
DROP TABLE IF EXISTS inflation_indices;
DROP TABLE IF EXISTS exchange_rates;
DROP TABLE IF EXISTS user_custom_dictionary;
DROP TABLE IF EXISTS official_naics_factors;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE official_naics_factors (
    naics_code CHAR(6) NOT NULL,
    description VARCHAR(500) NOT NULL,
    category ENUM('raw_material', 'fabrication', 'surface_treatment', 'transport', 'other') NULL,
    kgco2e_per_usd DECIMAL(18,8) NOT NULL,
    factor_year SMALLINT UNSIGNED NOT NULL DEFAULT 2022,
    currency_year SMALLINT UNSIGNED NOT NULL DEFAULT 2022,
    data_source VARCHAR(128) NOT NULL DEFAULT 'EPA USEEIO',
    source_version VARCHAR(64) NULL,
    source_url VARCHAR(512) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (naics_code),
    KEY idx_official_naics_category (category),
    KEY idx_official_naics_active (is_active),
    FULLTEXT KEY ft_official_naics_description (description),
    CONSTRAINT chk_official_naics_code CHECK (naics_code REGEXP '^[0-9]{6}$'),
    CONSTRAINT chk_official_naics_factor CHECK (kgco2e_per_usd >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_custom_dictionary (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id VARCHAR(128) NOT NULL,
    material_token VARCHAR(255) NOT NULL,
    mapped_naics CHAR(6) NOT NULL,
    source ENUM('manual_confirm', 'batch_import', 'api', 'migration') NOT NULL DEFAULT 'manual_confirm',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_user_material_token (user_id, material_token),
    KEY idx_user_custom_dictionary_mapped_naics (mapped_naics),
    KEY idx_user_custom_dictionary_user (user_id),
    CONSTRAINT fk_user_custom_dictionary_mapped_naics
        FOREIGN KEY (mapped_naics)
        REFERENCES official_naics_factors (naics_code)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_user_dictionary_naics CHECK (mapped_naics REGEXP '^[0-9]{6}$'),
    CONSTRAINT chk_user_dictionary_material_not_numeric_only CHECK (material_token NOT REGEXP '^[0-9]+$'),
    CONSTRAINT chk_user_dictionary_material_length CHECK (CHAR_LENGTH(TRIM(material_token)) >= 2),
    CONSTRAINT chk_user_dictionary_user_length CHECK (CHAR_LENGTH(TRIM(user_id)) >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exchange_rates (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    year SMALLINT UNSIGNED NOT NULL,
    currency_code CHAR(3) NOT NULL,
    rate_to_usd DECIMAL(18,8) NOT NULL,
    source VARCHAR(128) NOT NULL DEFAULT 'manual',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_exchange_rates_year_currency (year, currency_code),
    KEY idx_exchange_rates_currency (currency_code),
    CONSTRAINT chk_exchange_rates_currency CHECK (currency_code REGEXP '^[A-Z]{3}$'),
    CONSTRAINT chk_exchange_rates_rate CHECK (rate_to_usd > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inflation_indices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    year SMALLINT UNSIGNED NOT NULL,
    region_code VARCHAR(16) NOT NULL DEFAULT 'US',
    index_name VARCHAR(64) NOT NULL DEFAULT 'CPI',
    index_value DECIMAL(18,8) NOT NULL,
    base_year SMALLINT UNSIGNED NOT NULL DEFAULT 2022,
    source VARCHAR(128) NOT NULL DEFAULT 'manual',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_inflation_indices (year, region_code, index_name),
    KEY idx_inflation_indices_base_year (base_year),
    CONSTRAINT chk_inflation_indices_value CHECK (index_value > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ceda_dataset_versions (
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

CREATE TABLE ceda_countries (
    country_code CHAR(3) NOT NULL,
    country_name VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (country_code),
    UNIQUE KEY uq_ceda_country_name (country_name),
    CONSTRAINT chk_ceda_country_code CHECK (country_code REGEXP '^[A-Z]{3}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ceda_sectors (
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

CREATE TABLE ceda_emission_factors (
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

CREATE TABLE method3_purchase_types (
    purchase_type_code VARCHAR(64) NOT NULL,
    display_name VARCHAR(128) NOT NULL,
    price_index_type VARCHAR(64) NOT NULL,
    price_index_label VARCHAR(255) NOT NULL,
    display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (purchase_type_code),
    KEY idx_method3_purchase_type_index (price_index_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE singapore_price_indices (
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

CREATE TABLE method2_material_emission_factors (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    material_key VARCHAR(128) NOT NULL,
    material_name VARCHAR(255) NOT NULL,
    factor_value DECIMAL(18,8) NOT NULL,
    factor_unit ENUM('kgco2e_per_kg', 'kgco2e_per_tonne', 'kgco2e_per_usd') NOT NULL,
    region_code VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
    valid_from DATE NOT NULL DEFAULT '2022-01-01',
    valid_to DATE NULL,
    data_source VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_method2_material_factor (material_key, factor_unit, region_code, valid_from, data_source),
    KEY idx_method2_material_lookup (material_key, region_code),
    CONSTRAINT chk_method2_material_factor CHECK (factor_value >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE method2_grid_electricity_factors (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    country_code CHAR(2) NOT NULL,
    region_name VARCHAR(128) NULL,
    year SMALLINT UNSIGNED NOT NULL,
    kgco2e_per_kwh DECIMAL(18,8) NOT NULL,
    data_source VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_method2_grid_factor (country_code, region_name, year, data_source),
    KEY idx_method2_grid_year (year),
    CONSTRAINT chk_method2_grid_factor CHECK (kgco2e_per_kwh >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE method2_transport_emission_factors (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transport_mode ENUM('sea', 'land', 'air', 'rail', 'truck', 'vessel', 'ship') NOT NULL,
    vehicle_or_service VARCHAR(128) NOT NULL DEFAULT 'average',
    kgco2e_per_tonne_km DECIMAL(18,10) NOT NULL,
    region_code VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
    valid_from DATE NOT NULL DEFAULT '2022-01-01',
    valid_to DATE NULL,
    data_source VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_method2_transport_factor (transport_mode, vehicle_or_service, region_code, valid_from, data_source),
    CONSTRAINT chk_method2_transport_factor CHECK (kgco2e_per_tonne_km >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE method2_surface_treatment_factors (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    treatment_key VARCHAR(128) NOT NULL,
    treatment_name VARCHAR(255) NOT NULL,
    naics_code CHAR(6) NULL,
    kgco2e_per_kg_input DECIMAL(18,8) NULL,
    kgco2e_per_m2 DECIMAL(18,8) NULL,
    kgco2e_per_usd DECIMAL(18,8) NULL,
    region_code VARCHAR(16) NOT NULL DEFAULT 'GLOBAL',
    valid_from DATE NOT NULL DEFAULT '2022-01-01',
    valid_to DATE NULL,
    data_source VARCHAR(128) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_method2_surface_factor (treatment_key, region_code, valid_from, data_source),
    KEY idx_method2_surface_naics (naics_code),
    CONSTRAINT fk_method2_surface_naics
        FOREIGN KEY (naics_code)
        REFERENCES official_naics_factors (naics_code)
        ON UPDATE CASCADE
        ON DELETE SET NULL,
    CONSTRAINT chk_method2_surface_factor_present CHECK (
        kgco2e_per_kg_input IS NOT NULL
        OR kgco2e_per_m2 IS NOT NULL
        OR kgco2e_per_usd IS NOT NULL
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE method2_machine_profiles (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    machine_key VARCHAR(128) NOT NULL,
    machine_name VARCHAR(255) NOT NULL,
    duty_level VARCHAR(64) NOT NULL,
    peak_power_kw DECIMAL(18,8) NOT NULL,
    avg_operating_load_kw DECIMAL(18,8) NOT NULL,
    voltage_v DECIMAL(18,8) NULL,
    frequency_hz DECIMAL(18,8) NULL,
    full_load_current_a DECIMAL(18,8) NULL,
    country_code CHAR(2) NOT NULL DEFAULT 'SG',
    data_source VARCHAR(128) NOT NULL DEFAULT 'company_workbook',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_method2_machine_profile (machine_key, duty_level, country_code),
    KEY idx_method2_machine_country (country_code),
    CONSTRAINT chk_method2_machine_peak_power CHECK (peak_power_kw >= 0),
    CONSTRAINT chk_method2_machine_avg_load CHECK (avg_operating_load_kw >= 0),
    CONSTRAINT chk_method2_machine_voltage CHECK (voltage_v IS NULL OR voltage_v >= 0),
    CONSTRAINT chk_method2_machine_frequency CHECK (frequency_hz IS NULL OR frequency_hz >= 0),
    CONSTRAINT chk_method2_machine_current CHECK (full_load_current_a IS NULL OR full_load_current_a >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO official_naics_factors
    (naics_code, description, category, kgco2e_per_usd, factor_year, currency_year, data_source)
VALUES
    ('331110', 'Iron and Steel Mills and Ferroalloy Manufacturing', 'raw_material', 0.78700000, 2022, 2022, 'EPA USEEIO'),
    ('331313', 'Alumina Refining and Primary Aluminum Production', 'raw_material', 1.01800000, 2022, 2022, 'EPA USEEIO'),
    ('331315', 'Aluminum Sheet, Plate, and Foil Manufacturing', 'raw_material', 0.72100000, 2022, 2022, 'EPA USEEIO'),
    ('331318', 'Other Aluminum Rolling, Drawing, and Extruding', 'raw_material', 0.72100000, 2022, 2022, 'EPA USEEIO'),
    ('331410', 'Nonferrous Metal Smelting and Refining', 'raw_material', 0.42300000, 2022, 2022, 'EPA USEEIO'),
    ('331420', 'Copper Rolling, Drawing, Extruding, and Alloying', 'raw_material', 0.33400000, 2022, 2022, 'EPA USEEIO'),
    ('331491', 'Nonferrous Metal Rolling, Drawing, and Extruding', 'raw_material', 0.43100000, 2022, 2022, 'EPA USEEIO'),
    ('335991', 'Other Electrical Equipment Manufacturing', 'raw_material', 0.36300000, 2022, 2022, 'EPA USEEIO'),
    ('326199', 'All Other Plastics Product Manufacturing', 'raw_material', 0.37100000, 2022, 2022, 'EPA USEEIO'),
    ('325220', 'Artificial and Synthetic Fibers Manufacturing', 'raw_material', 0.90200000, 2022, 2022, 'EPA USEEIO'),
    ('326113', 'Unlaminated Plastics Film and Sheet Manufacturing', 'raw_material', 0.54400000, 2022, 2022, 'EPA USEEIO'),
    ('326130', 'Plastics Pipe, Pipe Fitting, and Unlaminated Profile Shape Manufacturing', 'raw_material', 0.46000000, 2022, 2022, 'EPA USEEIO'),
    ('332811', 'Metal Heat Treating', 'surface_treatment', 0.38200000, 2022, 2022, 'EPA USEEIO'),
    ('332812', 'Metal Coating and Allied Services', 'surface_treatment', 0.38200000, 2022, 2022, 'EPA USEEIO'),
    ('332813', 'Electroplating, Plating, Polishing, Anodizing, and Coloring', 'surface_treatment', 0.38200000, 2022, 2022, 'EPA USEEIO'),
    ('332999', 'All Other Miscellaneous Fabricated Metal Product Manufacturing', 'fabrication', 0.27200000, 2022, 2022, 'EPA USEEIO'),
    ('333515', 'Cutting Tool and Machine Tool Accessory Manufacturing', 'fabrication', 0.20700000, 2022, 2022, 'EPA USEEIO'),
    ('333517', 'Machine Tool Manufacturing', 'fabrication', 0.19900000, 2022, 2022, 'EPA USEEIO'),
    ('332710', 'Machine Shops', 'fabrication', 0.27800000, 2022, 2022, 'EPA USEEIO'),
    ('332322', 'Sheet Metal Work Manufacturing', 'fabrication', 0.22100000, 2022, 2022, 'EPA USEEIO'),
    ('333249', 'Other Industrial Machinery Manufacturing', 'fabrication', 0.18500000, 2022, 2022, 'EPA USEEIO')
ON DUPLICATE KEY UPDATE
    description = VALUES(description),
    category = VALUES(category),
    kgco2e_per_usd = VALUES(kgco2e_per_usd),
    data_source = VALUES(data_source);

INSERT INTO exchange_rates (year, currency_code, rate_to_usd, source) VALUES
    (2022, 'SGD', 0.74370000, 'project_default'),
    (2023, 'SGD', 0.75840000, 'project_default'),
    (2024, 'SGD', 0.73510000, 'project_default'),
    (2025, 'SGD', 0.77880000, 'project_default'),
    (2026, 'SGD', 0.77880000, 'project_default')
ON DUPLICATE KEY UPDATE rate_to_usd = VALUES(rate_to_usd), source = VALUES(source);

INSERT INTO inflation_indices (year, region_code, index_name, index_value, base_year, source) VALUES
    (2022, 'US', 'CPI', 118.01200000, 2022, 'project_default'),
    (2023, 'US', 'CPI', 122.38200000, 2022, 'project_default'),
    (2024, 'US', 'CPI', 125.42200000, 2022, 'project_default'),
    (2025, 'US', 'CPI', 128.97000000, 2022, 'project_default'),
    (2026, 'US', 'CPI', 128.97000000, 2022, 'project_default')
ON DUPLICATE KEY UPDATE index_value = VALUES(index_value), source = VALUES(source);

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

INSERT INTO method2_grid_electricity_factors
    (country_code, region_name, year, kgco2e_per_kwh, data_source)
VALUES
    ('SG', 'Singapore', 2026, 0.41680000, 'Company workbook EMA 2025/2026')
ON DUPLICATE KEY UPDATE kgco2e_per_kwh = VALUES(kgco2e_per_kwh);

INSERT INTO method2_transport_emission_factors
    (transport_mode, vehicle_or_service, kgco2e_per_tonne_km, region_code, data_source)
VALUES
    ('truck', 'average road freight', 0.1500000000, 'GLOBAL', 'GLEC-style prototype default'),
    ('sea', 'average container vessel', 0.0160000000, 'GLOBAL', 'GLEC-style prototype default'),
    ('air', 'average air freight', 0.6020000000, 'GLOBAL', 'GLEC-style prototype default')
ON DUPLICATE KEY UPDATE kgco2e_per_tonne_km = VALUES(kgco2e_per_tonne_km);
