from ecotransit_scraper import calculate_ecotransit

result = calculate_ecotransit(
    port_of_loading="Shanghai",
    weight_kg=1000
)

print(result)