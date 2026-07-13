import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'

import type {
  CalculateResponse,
  CalculationLineItemResult,
  EcoTransitResponse,
} from '@/lib/calculator-api'

const styles = StyleSheet.create({
  page: {
    paddingTop: 38,
    paddingRight: 40,
    paddingBottom: 56,
    paddingLeft: 40,
    color: '#18181b',
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    lineHeight: 1.4,
  },
  eyebrow: {
    color: '#4d7c0f',
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    fontSize: 21,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  pageTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  subtitle: {
    marginTop: 6,
    color: '#52525b',
    fontSize: 9.5,
    lineHeight: 1.4,
  },
  summary: {
    marginTop: 24,
    padding: 17,
    borderRadius: 6,
    backgroundColor: '#ecfccb',
  },
  summaryLabel: {
    color: '#4d7c0f',
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 23,
    fontWeight: 700,
    lineHeight: 1.15,
  },
  summaryMeta: {
    marginTop: 8,
    color: '#3f6212',
    lineHeight: 1.35,
  },
  section: {
    marginTop: 18,
  },
  sectionTitle: {
    marginBottom: 7,
    fontSize: 11.5,
    fontWeight: 700,
  },
  sectionDescription: {
    marginBottom: 9,
    color: '#52525b',
    fontSize: 8.5,
    lineHeight: 1.45,
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
    padding: 8,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d4d4d8',
  },
  detailThird: {
    width: '33.333%',
  },
  detailFull: {
    width: '100%',
  },
  detailLabel: {
    color: '#71717a',
    fontSize: 6.5,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
  },
  detailValue: {
    marginTop: 2,
    fontSize: 9.5,
    fontWeight: 700,
  },
  methodGrid: {
    flexDirection: 'row',
    gap: 7,
  },
  methodCard: {
    width: '33.333%',
    minHeight: 70,
    padding: 9,
    borderWidth: 1,
    borderColor: '#d4d4d8',
    borderRadius: 4,
    backgroundColor: '#fafafa',
  },
  methodStep: {
    color: '#4d7c0f',
    fontSize: 6.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  methodTitle: {
    marginTop: 4,
    fontSize: 9.5,
    fontWeight: 700,
  },
  methodFormula: {
    marginTop: 5,
    color: '#52525b',
    fontSize: 7.5,
    lineHeight: 1.4,
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
  totalRow: {
    backgroundColor: '#f4f4f5',
    fontWeight: 700,
  },
  cell: {
    paddingTop: 6,
    paddingRight: 5,
    paddingBottom: 6,
    paddingLeft: 5,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#d4d4d8',
    fontSize: 7.2,
  },
  componentCell: {
    width: '19%',
  },
  sgdCell: {
    width: '16%',
    textAlign: 'right',
  },
  usdCell: {
    width: '16%',
    textAlign: 'right',
  },
  usd2022Cell: {
    width: '16%',
    textAlign: 'right',
  },
  factorCell: {
    width: '15%',
    textAlign: 'right',
  },
  emissionCell: {
    width: '18%',
    textAlign: 'right',
  },
  auditNote: {
    marginTop: 10,
    padding: 9,
    borderLeftWidth: 3,
    borderLeftColor: '#84cc16',
    backgroundColor: '#f7fee7',
    color: '#3f6212',
    fontSize: 7.5,
    lineHeight: 1.45,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#d4d4d8',
  },
  categoryTitle: {
    fontSize: 11,
    fontWeight: 700,
  },
  categoryTotal: {
    color: '#4d7c0f',
    fontSize: 8.5,
    fontWeight: 700,
  },
  calculationCard: {
    marginBottom: 7,
    borderWidth: 1,
    borderColor: '#e4e4e7',
    borderRadius: 4,
    backgroundColor: '#fafafa',
  },
  calculationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 7,
    paddingRight: 9,
    paddingBottom: 7,
    paddingLeft: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
  },
  calculationLabel: {
    fontSize: 8.5,
    fontWeight: 700,
  },
  calculationResult: {
    color: '#4d7c0f',
    fontSize: 8.5,
    fontWeight: 700,
  },
  formulaRow: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingRight: 9,
    paddingBottom: 6,
    paddingLeft: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#e4e4e7',
  },
  formulaRowLast: {
    borderBottomWidth: 0,
  },
  formulaLabel: {
    width: '31%',
    color: '#52525b',
    fontSize: 7.5,
    fontWeight: 700,
  },
  formulaValue: {
    width: '69%',
    textAlign: 'right',
    fontSize: 7.5,
  },
  reconciliation: {
    borderWidth: 1,
    borderColor: '#bef264',
    borderRadius: 4,
    backgroundColor: '#f7fee7',
  },
  reconciliationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#d9f99d',
  },
  reconciliationTitle: {
    fontSize: 10.5,
    fontWeight: 700,
  },
  verified: {
    color: '#3f6212',
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  reconciliationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 7,
    paddingRight: 9,
    paddingBottom: 7,
    paddingLeft: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#ecfccb',
  },
  reconciliationLabel: {
    width: '31%',
    color: '#3f6212',
    fontSize: 7.5,
    fontWeight: 700,
  },
  reconciliationFormula: {
    width: '69%',
    textAlign: 'right',
    fontSize: 7.5,
  },
  transportValue: {
    marginTop: 3,
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

type CategoryKey = typeof categories[number]['key']

type CalculationLine = {
  amountSgd: number
  amountUsd: number
  amountUsd2022: number
  code: string
  factor: number
  emission: number
}

const formatNumber = (value: number, digits = 2) =>
  value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })

const sumCategories = (
  values: Record<CategoryKey, number>,
) => categories.reduce((sum, category) => sum + values[category.key], 0)

function getCalculationLines(result: CalculateResponse, categoryKey: CategoryKey): CalculationLine[] {
  const lineItems = result.calculation.line_items?.filter(
    (item): item is CalculationLineItemResult => item.category === categoryKey,
  ) ?? []

  if (lineItems.length > 0) {
    return lineItems.map((item) => ({
      amountSgd: item.amount_sgd,
      amountUsd: item.amount_usd,
      amountUsd2022: item.amount_usd2022,
      code: item.naics_code,
      factor: item.factor,
      emission: item.emission,
    }))
  }

  return [{
    amountSgd: result.calculation.sgd_amounts[categoryKey],
    amountUsd: result.calculation.usd_amounts[categoryKey],
    amountUsd2022: result.calculation.usd2022_amounts[categoryKey],
    code: 'Category aggregate',
    factor: result.calculation.factors[categoryKey],
    emission: result.emissions[categoryKey],
  }]
}

function getInflationBaseIndex(result: CalculateResponse): number {
  const lineItem = result.calculation.line_items?.find(
    (item) => item.amount_usd > 0 && Number.isFinite(item.amount_usd2022 / item.amount_usd),
  )

  if (lineItem) {
    return (lineItem.amount_usd2022 / lineItem.amount_usd) * result.calculation.inflation_index
  }

  for (const category of categories) {
    const amountUsd = result.calculation.usd_amounts[category.key]
    const amountUsd2022 = result.calculation.usd2022_amounts[category.key]
    if (amountUsd > 0 && Number.isFinite(amountUsd2022 / amountUsd)) {
      return (amountUsd2022 / amountUsd) * result.calculation.inflation_index
    }
  }

  return 100
}

function PdfHeader({
  invoiceId,
  detailPage = false,
}: {
  invoiceId: string
  detailPage?: boolean
}) {
  return (
    <>
      <Text style={styles.eyebrow}>C300 Carbon Emissions Calculator</Text>
      <Text style={detailPage ? styles.pageTitle : styles.title}>
        {detailPage ? 'Detailed Calculation Trail' : 'USEEIO Calculation Results'}
      </Text>
      <Text style={styles.subtitle}>
        {detailPage
          ? `Calculation evidence for invoice ${invoiceId}`
          : `Spend-based emissions report for invoice ${invoiceId}`}
      </Text>
    </>
  )
}

function PdfFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text>Generated {new Date().toLocaleDateString('en-SG')}</Text>
      <Text
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  )
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
  const transportReturned = Boolean(transport?.transport)
  const transportEmissionsAvailable = transport?.transport.chosen_emissions_kg != null
  const transportEmissions = transport?.transport.chosen_emissions_kg ?? 0
  const totalEmissions = result.emissions.total + transportEmissions
  const totalSgdCalculated = sumCategories(result.calculation.sgd_amounts)
  const totalUsd = sumCategories(result.calculation.usd_amounts)
  const totalUsd2022 = sumCategories(result.calculation.usd2022_amounts)
  const componentEmissions = sumCategories(result.emissions)
  const inflationBaseIndex = getInflationBaseIndex(result)
  const allocationDifference = totalSgdCalculated - totalSgd
  const useeioDifference = componentEmissions - result.emissions.total
  const totalsReconcile = Math.abs(allocationDifference) <= 0.01 && Math.abs(useeioDifference) <= 0.01

  return (
    <Document
      title={`USEEIO calculation - ${result.invoice_id}`}
      author="C300 Carbon Emissions Calculator"
      subject="USEEIO calculation results and calculation trail"
    >
      <Page size="A4" style={styles.page}>
        <PdfHeader invoiceId={result.invoice_id} />

        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>
            {transportEmissionsAvailable ? 'Total emissions including transport' : 'Total USEEIO emissions'}
          </Text>
          <Text style={styles.summaryValue}>{formatNumber(totalEmissions)} kg CO2e</Text>
          <Text style={styles.summaryMeta}>
            USEEIO {formatNumber(result.emissions.total)} kg CO2e
            {transportEmissionsAvailable
              ? `  |  Transport ${formatNumber(transportEmissions)} kg CO2e`
              : ''}
          </Text>
        </View>

        <View style={styles.section} wrap={false}>
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
              <Text style={styles.detailLabel}>Reporting-year USD</Text>
              <Text style={styles.detailValue}>USD {formatNumber(totalUsd)}</Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Spend in 2022 USD</Text>
              <Text style={styles.detailValue}>USD {formatNumber(totalUsd2022)}</Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>SGD to USD rate</Text>
              <Text style={styles.detailValue}>
                1 SGD = {formatNumber(result.calculation.fx_rate, 6)} USD
              </Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>{result.calculation.year} deflator index</Text>
              <Text style={styles.detailValue}>
                {formatNumber(result.calculation.inflation_index, 4)}
              </Text>
            </View>
            <View style={styles.detail}>
              <Text style={styles.detailLabel}>Derived 2022 base index</Text>
              <Text style={styles.detailValue}>{formatNumber(inflationBaseIndex, 4)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Calculation method</Text>
          <View style={styles.methodGrid}>
            <View style={styles.methodCard}>
              <Text style={styles.methodStep}>Step 1</Text>
              <Text style={styles.methodTitle}>Convert SGD to USD</Text>
              <Text style={styles.methodFormula}>SGD spend x reporting-year FX rate</Text>
            </View>
            <View style={styles.methodCard}>
              <Text style={styles.methodStep}>Step 2</Text>
              <Text style={styles.methodTitle}>Normalize to 2022 USD</Text>
              <Text style={styles.methodFormula}>
                Reporting-year USD x ({formatNumber(inflationBaseIndex, 4)} /{' '}
                {formatNumber(result.calculation.inflation_index, 4)})
              </Text>
            </View>
            <View style={styles.methodCard}>
              <Text style={styles.methodStep}>Step 3</Text>
              <Text style={styles.methodTitle}>Apply USEEIO factor</Text>
              <Text style={styles.methodFormula}>2022 USD x kg CO2e per 2022 USD</Text>
            </View>
          </View>
        </View>

        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Component calculation summary</Text>
          <View style={styles.table}>
            <View style={[styles.row, styles.headerRow]} fixed>
              <Text style={[styles.cell, styles.componentCell]}>Component</Text>
              <Text style={[styles.cell, styles.sgdCell]}>SGD</Text>
              <Text style={[styles.cell, styles.usdCell]}>{result.calculation.year} USD</Text>
              <Text style={[styles.cell, styles.usd2022Cell]}>2022 USD</Text>
              <Text style={[styles.cell, styles.factorCell]}>Effective factor</Text>
              <Text style={[styles.cell, styles.emissionCell]}>kg CO2e</Text>
            </View>
            {categories.map((category) => (
              <View key={category.key} style={styles.row} wrap={false}>
                <Text style={[styles.cell, styles.componentCell]}>{category.label}</Text>
                <Text style={[styles.cell, styles.sgdCell]}>
                  {formatNumber(result.calculation.sgd_amounts[category.key])}
                </Text>
                <Text style={[styles.cell, styles.usdCell]}>
                  {formatNumber(result.calculation.usd_amounts[category.key])}
                </Text>
                <Text style={[styles.cell, styles.usd2022Cell]}>
                  {formatNumber(result.calculation.usd2022_amounts[category.key])}
                </Text>
                <Text style={[styles.cell, styles.factorCell]}>
                  {formatNumber(result.calculation.factors[category.key], 6)}
                </Text>
                <Text style={[styles.cell, styles.emissionCell]}>
                  {formatNumber(result.emissions[category.key])}
                </Text>
              </View>
            ))}
            <View style={[styles.row, styles.totalRow]} wrap={false}>
              <Text style={[styles.cell, styles.componentCell]}>Total</Text>
              <Text style={[styles.cell, styles.sgdCell]}>{formatNumber(totalSgdCalculated)}</Text>
              <Text style={[styles.cell, styles.usdCell]}>{formatNumber(totalUsd)}</Text>
              <Text style={[styles.cell, styles.usd2022Cell]}>{formatNumber(totalUsd2022)}</Text>
              <Text style={[styles.cell, styles.factorCell]}>-</Text>
              <Text style={[styles.cell, styles.emissionCell]}>
                {formatNumber(result.emissions.total)}
              </Text>
            </View>
          </View>
          <Text style={styles.auditNote}>
            Displayed operands are rounded for readability. The calculator uses the full-precision values
            before this report formats them, so small rounding differences may appear.
          </Text>
        </View>

        <PdfFooter />
      </Page>

      <Page size="A4" style={styles.page}>
        <PdfHeader invoiceId={result.invoice_id} detailPage />

        <View style={styles.section}>
          <Text style={styles.sectionDescription}>
            Each line below follows the same three-stage calculation. NAICS factors are expressed as
            kilograms of CO2e per 2022 USD of spend.
          </Text>

          {categories.map((category) => {
            const lines = getCalculationLines(result, category.key)
            return (
              <View key={category.key}>
                <View style={styles.categoryHeader} minPresenceAhead={80}>
                  <Text style={styles.categoryTitle}>{category.label}</Text>
                  <Text style={styles.categoryTotal}>
                    Subtotal {formatNumber(result.emissions[category.key])} kg CO2e
                  </Text>
                </View>

                {lines.map((line, index) => (
                  <View key={`${category.key}-${line.code}-${index}`} style={styles.calculationCard} wrap={false}>
                    <View style={styles.calculationHeader}>
                      <Text style={styles.calculationLabel}>
                        {lines.length > 1 ? `Line ${index + 1}  |  ` : ''}
                        {line.code === 'Category aggregate' ? line.code : `NAICS ${line.code}`}
                      </Text>
                      <Text style={styles.calculationResult}>
                        {formatNumber(line.emission)} kg CO2e
                      </Text>
                    </View>
                    <View style={styles.formulaRow}>
                      <Text style={styles.formulaLabel}>1. Currency conversion</Text>
                      <Text style={styles.formulaValue}>
                        SGD {formatNumber(line.amountSgd)} x {formatNumber(result.calculation.fx_rate, 6)}
                        {' = '}USD {formatNumber(line.amountUsd)}
                      </Text>
                    </View>
                    <View style={styles.formulaRow}>
                      <Text style={styles.formulaLabel}>2. 2022 normalization</Text>
                      <Text style={styles.formulaValue}>
                        USD {formatNumber(line.amountUsd)} x ({formatNumber(inflationBaseIndex, 4)} /{' '}
                        {formatNumber(result.calculation.inflation_index, 4)}) = USD{' '}
                        {formatNumber(line.amountUsd2022)}
                      </Text>
                    </View>
                    <View style={[styles.formulaRow, styles.formulaRowLast]}>
                      <Text style={styles.formulaLabel}>3. Emission factor</Text>
                      <Text style={styles.formulaValue}>
                        USD {formatNumber(line.amountUsd2022)} x {formatNumber(line.factor, 6)} kg CO2e/2022 USD
                        {' = '}{formatNumber(line.emission)} kg CO2e
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )
          })}
        </View>

        {transportReturned && transport?.transport ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Transport result</Text>
            <Text style={styles.sectionDescription}>
              Transport emissions are returned by EcoTransit from the route, mode, and shipment inputs.
              No local transport factor is reconstructed in this report.
            </Text>
            <View style={styles.detailGrid}>
              <View style={styles.detail}>
                <Text style={styles.detailLabel}>Route</Text>
                <Text style={styles.transportValue}>
                  {transport.transport.port_of_loading} to {transport.transport.port_of_discharge}
                </Text>
              </View>
              <View style={styles.detail}>
                <Text style={styles.detailLabel}>Origin</Text>
                <Text style={styles.transportValue}>{transport.transport.origin}</Text>
              </View>
              <View style={[styles.detail, styles.detailThird]}>
                <Text style={styles.detailLabel}>Mode</Text>
                <Text style={styles.transportValue}>{transport.transport.chosen_mode}</Text>
              </View>
              <View style={[styles.detail, styles.detailThird]}>
                <Text style={styles.detailLabel}>Shipment weight</Text>
                <Text style={styles.transportValue}>
                  {formatNumber(transport.transport.weight_kg)} kg
                </Text>
              </View>
              <View style={[styles.detail, styles.detailThird]}>
                <Text style={styles.detailLabel}>Reported emissions</Text>
                <Text style={styles.transportValue}>
                  {transportEmissionsAvailable
                    ? `${formatNumber(transportEmissions)} kg CO2e`
                    : 'Not returned'}
                </Text>
              </View>
              {transport.transport.distance_km != null ? (
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>Distance</Text>
                  <Text style={styles.transportValue}>
                    {formatNumber(transport.transport.distance_km)} km
                  </Text>
                </View>
              ) : null}
              {transport.transport.energy_mj != null ? (
                <View style={styles.detail}>
                  <Text style={styles.detailLabel}>Energy</Text>
                  <Text style={styles.transportValue}>
                    {formatNumber(transport.transport.energy_mj)} MJ
                  </Text>
                </View>
              ) : null}
              <View style={[styles.detail, styles.detailFull]}>
                <Text style={styles.detailLabel}>Source</Text>
                <Text style={styles.transportValue}>{transport.transport.source}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section} wrap={false}>
          <View style={styles.reconciliation}>
            <View style={styles.reconciliationHeader}>
              <Text style={styles.reconciliationTitle}>Arithmetic reconciliation</Text>
              <Text style={styles.verified}>{totalsReconcile ? 'Totals reconcile' : 'Totals differ'}</Text>
            </View>
            <View style={styles.reconciliationRow}>
              <Text style={styles.reconciliationLabel}>Allocated spend</Text>
              <Text style={styles.reconciliationFormula}>
                {categories.map((category) => formatNumber(result.calculation.sgd_amounts[category.key])).join(' + ')}
                {' = '}SGD {formatNumber(totalSgdCalculated)} | Invoice SGD {formatNumber(totalSgd)}
              </Text>
            </View>
            <View style={styles.reconciliationRow}>
              <Text style={styles.reconciliationLabel}>USEEIO subtotal</Text>
              <Text style={styles.reconciliationFormula}>
                {categories.map((category) => formatNumber(result.emissions[category.key])).join(' + ')}
                {' = '}{formatNumber(componentEmissions)} kg CO2e | Reported{' '}
                {formatNumber(result.emissions.total)} kg CO2e
              </Text>
            </View>
            <View style={[styles.reconciliationRow, styles.formulaRowLast]}>
              <Text style={styles.reconciliationLabel}>Final reported total</Text>
              <Text style={styles.reconciliationFormula}>
                {transportEmissionsAvailable
                  ? `${formatNumber(result.emissions.total)} + ${formatNumber(transportEmissions)} = ${formatNumber(totalEmissions)} kg CO2e`
                  : `${formatNumber(result.emissions.total)} = ${formatNumber(totalEmissions)} kg CO2e (no transport emissions included)`}
              </Text>
            </View>
          </View>
        </View>

        <PdfFooter />
      </Page>
    </Document>
  )
}
