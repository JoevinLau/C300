import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

import type { CalculateResponse, EcoTransitResponse } from '@/lib/calculator-api'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    color: '#18181b',
    fontFamily: 'Helvetica',
    fontSize: 9,
    lineHeight: 1.45,
  },
  eyebrow: {
    color: '#4d7c0f',
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  subtitle: {
    marginTop: 8,
    color: '#52525b',
    fontSize: 10,
    lineHeight: 1.4,
  },
  summary: {
    marginTop: 32,
    padding: 20,
    borderRadius: 6,
    backgroundColor: '#ecfccb',
  },
  summaryLabel: {
    color: '#4d7c0f',
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryValue: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.15,
  },
  summaryMeta: {
    marginTop: 10,
    color: '#3f6212',
    lineHeight: 1.35,
  },
  section: {
    marginTop: 22,
  },
  sectionTitle: {
    marginBottom: 8,
    fontSize: 12,
    fontWeight: 700,
  },
  table: {
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#d4d4d8',
  },
  row: {
    flexDirection: 'row',
  },
  headerRow: {
    backgroundColor: '#18181b',
    color: '#ffffff',
    fontWeight: 700,
  },
  cell: {
    width: '25%',
    padding: 7,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d4d4d8',
  },
  componentCell: {
    width: '28%',
  },
  numberCell: {
    width: '24%',
    textAlign: 'right',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#d4d4d8',
  },
  detail: {
    width: '50%',
    padding: 9,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d4d4d8',
  },
  detailLabel: {
    color: '#71717a',
    fontSize: 7,
    textTransform: 'uppercase',
  },
  detailValue: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: 700,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    padding: 10,
    backgroundColor: '#f4f4f5',
    fontSize: 11,
    fontWeight: 700,
  },
  factorCard: {
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#f4f4f5',
  },
  factorTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 7,
  },
  factorLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  factorCode: {
    width: '24%',
    fontSize: 9,
    fontWeight: 700,
  },
  factorFormula: {
    width: '76%',
    textAlign: 'right',
    fontSize: 9,
    fontWeight: 700,
  },
  footer: {
    position: 'absolute',
    right: 40,
    bottom: 24,
    left: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#71717a',
    fontSize: 7,
  },
})

const categories = [
  { label: 'Raw material', key: 'raw_material' },
  { label: 'Fabrication', key: 'fabrication' },
  { label: 'Surface treatment', key: 'surface_treatment' },
] as const

const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

function getFactorLines(result: CalculateResponse, categoryKey: typeof categories[number]['key']) {
  const lineItems = result.calculation.line_items?.filter((item) => item.category === categoryKey) ?? []
  if (lineItems.length > 0) {
    return lineItems.map((item) => ({
      code: item.naics_code,
      usd2022: item.amount_usd2022,
      factor: item.factor,
      emission: item.emission,
    }))
  }

  return [{
    code: 'NAICS',
    usd2022: result.calculation.usd2022_amounts[categoryKey],
    factor: result.calculation.factors[categoryKey],
    emission: result.emissions[categoryKey],
  }]
}

export function UseeioResultsPdf({
  result,
  totalSgd,
  transport,
}: {
  result: CalculateResponse
  totalSgd: number
  transport?: EcoTransitResponse | null
}) {
  const transportEmissions = transport?.transport.chosen_emissions_kg ?? 0
  const totalEmissions = result.emissions.total + transportEmissions
  const totalUsd2022 = categories.reduce(
    (sum, category) => sum + result.calculation.usd2022_amounts[category.key],
    0,
  )

  return (
    <Document
      title={`USEEIO calculation - ${result.invoice_id}`}
      author="C300 Carbon Emissions Calculator"
      subject="USEEIO calculation results"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>C300 Carbon Emissions Calculator</Text>
        <Text style={styles.title}>USEEIO Calculation Results</Text>
        <Text style={styles.subtitle}>
          Spend-based emissions report for invoice {result.invoice_id}
        </Text>

        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>
            {transportEmissions > 0 ? 'Total emissions including transport' : 'Total emissions'}
          </Text>
          <Text style={styles.summaryValue}>{formatNumber(totalEmissions)} kg CO2e</Text>
          <Text style={styles.summaryMeta}>
            USEEIO: {formatNumber(result.emissions.total)} kg CO2e
            {transportEmissions > 0
              ? `  |  Transport: ${formatNumber(transportEmissions)} kg CO2e`
              : ''}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calculation overview</Text>
          <View style={styles.detailGrid}>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Invoice ID</Text>
              <Text style={styles.detailValue}>{result.invoice_id}</Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Reporting year</Text>
              <Text style={styles.detailValue}>{result.calculation.year}</Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Invoice total</Text>
              <Text style={styles.detailValue}>SGD {formatNumber(totalSgd)}</Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Spend in 2022 USD</Text>
              <Text style={styles.detailValue}>USD {formatNumber(totalUsd2022)}</Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>SGD to USD rate</Text>
              <Text style={styles.detailValue}>{formatNumber(result.calculation.fx_rate, 4)}</Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Inflation index</Text>
              <Text style={styles.detailValue}>
                {formatNumber(result.calculation.inflation_index, 4)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Component breakdown</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cell, styles.componentCell]}>Component</Text>
              <Text style={[styles.cell, styles.numberCell]}>SGD spend</Text>
              <Text style={[styles.cell, styles.numberCell]}>2022 USD</Text>
              <Text style={[styles.cell, styles.numberCell]}>kg CO2e</Text>
            </View>
            {categories.map((category) => (
              <View key={category.key} style={styles.row}>
                <Text style={[styles.cell, styles.componentCell]}>{category.label}</Text>
                <Text style={[styles.cell, styles.numberCell]}>
                  {formatNumber(result.calculation.sgd_amounts[category.key])}
                </Text>
                <Text style={[styles.cell, styles.numberCell]}>
                  {formatNumber(result.calculation.usd2022_amounts[category.key])}
                </Text>
                <Text style={[styles.cell, styles.numberCell]}>
                  {formatNumber(result.emissions[category.key])}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Emission factor calculation</Text>
          {categories.map((category) => {
            const lines = getFactorLines(result, category.key)
            return (
              <View key={category.key} style={styles.factorCard} wrap={false}>
                <Text style={styles.factorTitle}>{category.label}</Text>
                {lines.map((line, index) => (
                  <View key={`${category.key}-${line.code}-${index}`} style={styles.factorLine}>
                    <Text style={styles.factorCode}>{line.code}</Text>
                    <Text style={styles.factorFormula}>
                      USD {formatNumber(line.usd2022)} x {formatNumber(line.factor, 4)} ={' '}
                      {formatNumber(line.emission)} kg CO2e
                    </Text>
                  </View>
                ))}
              </View>
            )
          })}
        </View>

        {transport?.transport ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transport</Text>
            <View style={styles.detailGrid}>
              <View style={styles.detail}>
                <Text style={styles.detailLabel}>Route</Text>
                <Text style={styles.detailValue}>
                  {transport.transport.port_of_loading} to {transport.transport.port_of_discharge}
                </Text>
              </View>
              <View style={styles.detail}>
                <Text style={styles.detailLabel}>Mode and weight</Text>
                <Text style={styles.detailValue}>
                  {transport.transport.chosen_mode} | {formatNumber(transport.transport.weight_kg)} kg
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text>Generated {new Date().toLocaleDateString('en-SG')}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
