import { Pressable, ScrollView, Text } from "react-native";
import { AppIcon } from "../../../shared/icons/AppIcon";
import { AppTheme } from "../../../shared/theme/appPalette";
import { createStyles } from "../../home/homeStyles";
export function TagChips({ allLabel, tags, selectedTags, onToggleTag, onAddTag, styles, theme, }: {
    allLabel: string;
    tags: string[];
    selectedTags: string[];
    onToggleTag: (tag: string) => void;
    onAddTag: () => void;
    styles: ReturnType<typeof createStyles>;
    theme: AppTheme;
}) {
    return (<>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipWrap} style={styles.chipScroll}>
        <Pressable style={[styles.chip, selectedTags.length === 0 && styles.chipActive]} onPress={() => onToggleTag("all")}>
          <Text style={[
            styles.chipText,
            selectedTags.length === 0 && styles.chipTextActive,
        ]}>
            {allLabel}
          </Text>
        </Pressable>
        {tags.map((tag) => {
            const selected = selectedTags.includes(tag);
            return (<Pressable key={tag} style={[styles.chip, selected && styles.chipActive]} onPress={() => onToggleTag(tag)}>
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {tag}
              </Text>
            </Pressable>);
        })}
        <Pressable style={styles.addChip} onPress={onAddTag}>
          <AppIcon icon="mdi:plus" size={16} color={theme.primaryText}/>
        </Pressable>
      </ScrollView>
    </>);
}
