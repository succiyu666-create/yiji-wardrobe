# Wardrobe product blueprint

## Core records

Use these fields unless the existing project already has compatible equivalents.

```ts
type ClothingItem = {
  id: string;
  name: string;
  category: string;
  color: string;
  season: string;
  notes: string;
  image: string;
  price: number | null;
  wearCount: number;
  lastWornAt: number | null;
  archived: boolean;
  archiveDisposition: "undecided" | "discarded" | "resold";
  resalePrice: number | null;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};

type Outfit = {
  id: string;
  name: string;
  season: "春" | "夏" | "秋" | "冬";
  occasion: string;
  notes: string;
  itemIds: string[];
  createdAt: number;
  updatedAt: number;
};
```

Default garment categories: `上衣`, `下装`, `外套`, `连衣裙`, `鞋履`, `袜子`, `包袋`, `配饰`, `其他`.

## Cost and lifecycle rules

- Average cost per wear: `purchase price / wear count`; show a pending state if either value is unknown.
- Final usage cost for discarded item: `purchase price`.
- Final usage cost for resold item: `purchase price - resale price`.
- Final cost per wear: `final usage cost / wear count`; show a pending state when there is no wear history.
- Do not calculate final cost for a pending archive disposition.

## Navigation and screens

Use three clear destinations: active wardrobe, seasonal dressing room, and archive. Keep archive counts and outcome statuses visible. On mobile, retain a direct archive entry rather than burying it in overflow.

## Visual direction

Aim for a sunlit dressing room rather than a commerce catalogue or an analytics dashboard:

- warm cream background and quiet card surfaces;
- butter or sage for primary and positive accents;
- restrained coral for attention or discarded status;
- medium rounded corners, soft borders, minimal shadows;
- clothing photos are the strongest color on the screen;
- avoid gradients, glass effects, dark technical chrome, and decorative elements that compete with garments.

## Persistence

For a single-user prototype, IndexedDB is appropriate for garments, outfits, and image data. Explain that clearing site data removes the local collection and that other devices do not automatically sync.
