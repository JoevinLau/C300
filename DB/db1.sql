INSERT INTO NAICS_Mapping_Table (material_name, naics_code)
VALUES
('DF2 (2510/GOA)', '331110'),
('S50C', '331110'),
('S-Star', '331110'),
('S-Star Raw Material', '331110'),
('SS 303', '331110'),
('SUS 304', '331110'),
('2316', '331110'),
('HPG-83', '331110'),
('HPG-51', '331110'),
('AISI 01/2510', '331110'),
('Alu 6061', '331315'),
('Alu', '331315'),
('Brass', '331420'),
('Copper', '331420'),
('Titanium', '331491'),
('Poco Zee-2', '335991'),
('Hasberg Calibrated Shim Foils', '332999'),
('White Delrin', '326119'),
('Black Delrin', '326119'),
('PE 500 Black', '326119'),
('Clear Acrylic', '325220'),
('Monocast M501CD R6 Sheet', '326113'),
('G10 Sheet', '326199'),
('Peek 1000 Natural', '326199'),
('Semitron 420', '326199'),
('Krefine ESD Peek SS07 Sheet', '326199'),
('Pomalux SD Natural Plate', '326130'),
('449 Opal White Acrylic Sheet', '326113'),
('Teflon CA 25% Black', '326199'),
('Nylon Blue Sheet', '326199'),
('Clear Anti-Static (ESD) Acrylic', '326199'),
('Pomalux SD Natural', '326199'),
('Natural ABS Sheet', '326199'),
('Red Silicone Sponge', '326199');

SELECT * FROM NAICS_Mapping_Table;

INSERT INTO USEEIO_Factors_Table (naics_code, kgco2e_per_usd)
VALUES
('331110', 0.787),
('331315', 0.721),
('331420', 0.334),
('331491', 0.431),
('335991', 0.363),
('332999', 0.272),
('326199', 0.371),
('325220', 0.902),
('326113', 0.544),
('326130', 0.460);

SELECT * FROM USEEIO_Factors_Table;

INSERT INTO Exchange_Inflation_Table
(year, sgd_to_usd_rate, us_inflation_rate)
VALUES
(2022, 0.7437, 8.00),
(2023, 0.7584, 4.10),
(2024, 0.7351, 3.00),
(2025, 0.7788, 2.50),
(2026, 0.7788, 2.20);

SELECT * FROM Exchange_Inflation_Table;
