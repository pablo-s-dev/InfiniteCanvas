import { Pressable, ScrollView, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { useDialogStyles } from "../../../shared/ui/dialogStyles";
import { webTitle } from "../../../shared/ui/webTitle";
export function TagChipPicker({
  tags,
  selectedTags,
  onToggleTag,
  onAddTag,
  labels,
  disabled = false,
}: {
  tags: string[];
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onAddTag: () => void;
  labels: {
    noTags: string;
    addTag: string;
  };
  disabled?: boolean;
}) {
  const styles = useDialogStyles();
  return (
    <View style={styles.dialogChipPanel}>
      <ScrollView
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        style={styles.dialogChipScroll}
        contentContainerStyle={styles.dialogChipList}
      >
        {tags.length === 0 ? (
          <Text style={styles.dialogNoTags}>{labels.noTags}</Text>
        ) : null}
        {tags.map((tag) => {
          const selected = selectedTags.includes(tag);
          return (
            <Pressable
              key={tag}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={disabled}
              style={[
                styles.dialogChip,
                selected && styles.dialogChipSelected,
                disabled && styles.dialogButtonDisabled,
              ]}
              onPress={() => onToggleTag(tag)}
              {...webTitle(tag)}
            >
              <Text
                style={[
                  styles.dialogChipText,
                  selected && styles.dialogChipTextSelected,
                ]}
              >
                {tag}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.addTag}
          disabled={disabled}
          style={[
            styles.dialogAddChip,
            disabled && styles.dialogButtonDisabled,
          ]}
          onPress={onAddTag}
          {...webTitle(labels.addTag)}
        >
          <AppIcon
            icon="mdi:plus"
            size={16}
            color={styles.dialogButtonPrimaryText.color}
          />
        </Pressable>
      </ScrollView>
    </View>
  );
}
