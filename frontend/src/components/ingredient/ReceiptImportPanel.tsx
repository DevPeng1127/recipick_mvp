import IngredientImportPanel, { type ImportPanelProps } from './IngredientImportPanel'

export default function ReceiptImportPanel(props: ImportPanelProps) {
  return <IngredientImportPanel {...props} mode="receipt" />
}
