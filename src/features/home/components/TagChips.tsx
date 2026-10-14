import { Pressable, ScrollView, Text, View } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { AppTheme } from "../../../shared/theme/appPalette";
import { webTitle } from "../../../shared/ui/webTitle";
import { createStyles } from "../../home/homeStyles";
export function TagChips({ allLabel, addTagLabel, tags, selectedTags, onToggleTag, onAddTag, styles, theme, }: {
    allLabel: string;
    addTagLabel: string;
    tags: string[];
    selectedTags: string[];
    onToggleTag: (tag: string) => void;
    onAddTag: () => void;
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
}) {
    return (<View style={styles.tagChipsRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={addTagLabel} style={styles.addChip} onPress={onAddTag} {...webTitle(addTagLabel)}>
        <AppIcon icon="mdi:plus" size={16} color={theme.primaryText}/>
      </Pressable>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipWrap} style={styles.chipScroll}>
        <Pressable accessibilityRole="button" accessibilityLabel={allLabel} style={[styles.chip, selectedTags.length === 0 && styles.chipActive]} onPress={() => onToggleTag("all")} {...webTitle(allLabel)}>
          <Text style={[
            styles.chipText,
            selectedTags.length === 0 && styles.chipTextActive,
        ]}>
            {allLabel}
          </Text>
        </Pressable>
        {tags.map((tag) => {
            const selected = selectedTags.includes(tag);
            return (<Pressable key={tag} accessibilityRole="button" accessibilityLabel={tag} style={[styles.chip, selected && styles.chipActive]} onPress={() => onToggleTag(tag)} {...webTitle(tag)}>
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {tag}
              </Text>
            </Pressable>);
        })}
      </ScrollView>
    </View>);
}
