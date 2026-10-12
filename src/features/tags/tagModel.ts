export type CompositeTagJson = {
  name: string;
  value?: CompositeTagJson[];
  flatValues?: string[];
};

export class CompositeTag {
  name: string;
  value?: CompositeTag[];
  flatValues: string[];

  constructor({
    name,
    value,
    flatValues,
  }: {
    name: string;
    value?: CompositeTag[];
    flatValues?: string[];
  }) {
    this.name = name.trim();
    this.value = value;
    this.flatValues = flatValues ?? this.flattenValues();
  }

  equals(other: CompositeTag) {
    return this.name.toLowerCase() === other.name.toLowerCase();
  }

  flattenOptions(): CompositeTag[] {
    if (!this.value?.length) return [this];

    return this.value.reduce<CompositeTag[]>(
      (options, child) => options.concat(child.flattenOptions()),
      [this],
    );
  }

  flattenValues(): string[] {
    if (!this.value?.length) return [this.name];

    return Array.from(
      new Set(
        this.value.reduce<string[]>(
          (values, child) => values.concat(child.flattenValues()),
          [this.name],
        ),
      ),
    );
  }

  includes(value: string) {
    const normalized = value.trim().toLowerCase();
    return this.flattenValues().some(
      (tagValue) => tagValue.toLowerCase() === normalized,
    );
  }

  toJSON(): CompositeTagJson {
    return {
      name: this.name,
      value: this.value?.map((child) => child.toJSON()),
      flatValues: this.flatValues,
    };
  }

  static fromJSON(json: CompositeTagJson): CompositeTag {
    return new CompositeTag({
      name: json.name,
      value: json.value?.map((child) => CompositeTag.fromJSON(child)),
      flatValues: json.flatValues,
    });
  }
}

export const flattenCompositeTags = (tags: CompositeTag[]) =>
  Array.from(new Set(tags.flatMap((tag) => tag.flattenValues())));
