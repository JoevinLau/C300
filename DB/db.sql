USE carbon_emission_db;


CREATE TABLE Exchange_Inflation_Table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    year INT NOT NULL UNIQUE,
    sgd_to_usd_rate DECIMAL(10,4) NOT NULL, 
    us_inflation_rate DECIMAL(5,2) NOT NULL,
    INDEX idx_year (year)
);


CREATE TABLE USEEIO_Factors_Table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    naics_code VARCHAR(20) NOT NULL UNIQUE,
    kgco2e_per_usd DECIMAL(10,4) NOT NULL,
    INDEX idx_naics (naics_code)
);


CREATE TABLE NAICS_Mapping_Table (
    id INT AUTO_INCREMENT PRIMARY KEY,
    material_name VARCHAR(150) NOT NULL UNIQUE, 
    naics_code VARCHAR(20) NOT NULL,
    INDEX idx_material (material_name)
);