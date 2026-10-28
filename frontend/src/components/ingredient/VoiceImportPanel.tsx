import IngredientImportPanel, { type ImportPanelProps } from './IngredientImportPanel'

export default function VoiceImportPanel(props: ImportPanelProps) {
  return <IngredientImportPanel {...props} mode="voice" />
}
