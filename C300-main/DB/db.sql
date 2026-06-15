USE defaultdb;

CREATE TABLE naics_factors (
    naics_code VARCHAR(20) PRIMARY KEY,
	naics_description VARCHAR(500) NOT NULL, 
	category ENUM('raw_material', 'fabrication', 'surface_treatment') NOT NULL,
    kgco2e_per_usd DECIMAL(10,3) NOT NULL
);

INSERT INTO naics_factors (naics_code, naics_description,category, kgco2e_per_usd) VALUES
('331110', 'Iron and Steel Mills and Ferroalloy Manufacturing', 'raw_material', 0.787),
('331313', 'Alumina Refining and Primary Aluminum Production', 'raw_material', 1.018),
('331315', 'Aluminum Sheet, Plate, and Foil Manufacturing', 'raw_material', 0.721),
('331318', 'Other Aluminum Rolling, Drawing, and Extruding', 'raw_material', 0.721),
('331410', 'Nonferrous Metal Smelting and Refining', 'raw_material', 0.423),
('331420', 'Copper Rolling, Drawing, Extruding, and Alloying', 'raw_material', 0.334),
('331491', 'Nonferrous Metal Rolling, Drawing, and Extruding', 'raw_material', 0.431),
('335991', 'Other Electrical Equipment Manufacturing', 'raw_material', 0.363),
('326199', 'All Other Plastics Product Manufacturing', 'raw_material', 0.371),
('325220', 'Artificial and Synthetic Fibers,Manufacturing', 'raw_material', 0.902),
('326113', 'Unlaminated Plastics Film and Sheet Manufacturing', 'raw_material', 0.544),
('326130', 'Plastics Pipe, Pipe Fitting, and Unlaminated Profile Shape Manufacturing', 'raw_material', 0.460),
('332811', 'Metal Heat Treating', 'surface_treatment', 0.382),
('332812', 'Metal Coating and Allied Services', 'surface_treatment', 0.382),
('332813', 'Electroplating Plating, Polishing, Anodizing, and Coloring', 'surface_treatment', 0.382),
('332999', 'All Other Miscellaneous Fabricated Metal Product Manufacturing', 'surface_treatment', 0.272),
('333515', 'Cutting Tool and Machine Tool Accessory Manufacturing', 'fabrication', 0.207),
('333517', 'Machine Tool Manufacturing', 'fabrication', 0.199)
('332710', 'Machine Shops', 'fabrication', 0.278),
('332322', 'Sheet Metal Work Manufacturing', 'fabrication', 0.221),
('333249', 'Other Industrial Machinery Manufacturing', 'fabrication', 0.185);

CREATE TABLE exchange_rates (
    year INT PRIMARY KEY,
    currency_code VARCHAR(10) NOT NULL,
    rate_to_usd DECIMAL(10,4) NOT NULL
);

INSERT INTO exchange_rates (year, currency_code, rate_to_usd) VALUES
(2022, 'SGD', 0.7437),
(2023, 'SGD', 0.7584),
(2024, 'SGD', 0.7351),
(2025, 'SGD', 0.7788),
(2026, 'SGD', 0.7788);

CREATE TABLE inflation_indices (
    year INT PRIMARY KEY,
    index_value DECIMAL(10,4) NOT NULL
);

INSERT INTO inflation_indices (year, index_value) VALUES
(2022, 118.012), 
(2023, 122.382),
(2024, 125.422),
(2025, 128.970),
(2026, 128.970); 
