# THE LOOK BOOK — Sunny Closet

## 1. Design System

### 1.1 Creative direction

THE LOOK BOOK is a bright, personal wardrobe tool. The interface should feel like opening a sunlit dressing room: calm enough to let colorful clothing photographs lead, warm enough to feel lived-in, and polished without becoming cold or technical.

The visual language borrows from clothing labels, wardrobe tags, neatly arranged shelves, and seasonal color cards. It should never feel like an e-commerce catalogue or an analytics dashboard.

### 1.2 Color tokens

| Token | Value | Use |
| --- | --- | --- |
| Ink | `#2B2A23` | Primary text and strong outlines |
| Muted ink | `#767267` | Secondary text |
| Cream | `#F8F4EA` | Main page background |
| Deep cream | `#EEE7D8` | Navigation and subtle section surfaces |
| Card | `#FFFDF7` | Photo cards, drawers, forms |
| Butter | `#F2C84B` | Primary action and active accents |
| Butter dark | `#D8AC2F` | Hover state |
| Sage | `#829276` | Secondary accents and status |
| Coral | `#DF8066` | Warm seasonal detail |
| Sky | `#A9CBD2` | Cool seasonal detail |
| Line | `rgba(43, 42, 35, 0.12)` | Quiet borders |

Season signatures:

- Spring: soft sage `#DFE9D4`
- Summer: butter `#F7D96F`
- Autumn: warm peach `#EFC3A5`
- Winter: pale sky `#D8E6E8`

### 1.3 Typography

- Display and interface: `Avenir Next`, `Helvetica Neue`, `PingFang SC`, system sans-serif.
- Headlines use medium weight, tight tracking, and generous line-height.
- English labels use small uppercase text with relaxed letter spacing, like a clothing tag.
- Avoid ornamental serif type and avoid oversized editorial typography that competes with clothing photos.

### 1.4 Shape, spacing, and surfaces

- Medium rounded corners: 12–24 px.
- Photo containers: 18 px.
- Buttons and inputs: 12–14 px.
- Cards use soft surface changes before shadows.
- Shadows are light, warm, and used only for elevation.
- Mobile navigation is light cream, never a dark technical bar.

## 2. Page Structure

### Shared navigation

- Desktop: a warm cream side rail with THE LOOK BOOK wordmark, three clear destinations (Wardrobe, Dressing Room, Archive), and local-storage status.
- Mobile: compact wordmark at the top and a three-part bottom navigation.
- Primary action stays visible in the top-right: add an item in Wardrobe, create a look in Dressing Room.

### Wardrobe

1. Friendly introduction: “今天想穿什么？”
2. Small wardrobe summary.
3. Search, archive access, and category filters.
4. Usage-attention filter and sorting by last wear, wear count, or cost per wear.
5. Photo-first item grid with quiet wear-efficiency status.
6. Clicking an item opens its price, wear history, cost per wear, and every look that contains it.

### Archive

1. A first-class navigation destination, not a hidden filter.
2. Summary counts for pending, discarded, and resold items.
3. Every archived card carries a visible disposition label and final usage cost.
4. Archive details record the archive date, resale price, final usage cost, and final cost per wear.
5. Archived items can be edited or restored to the active wardrobe.

### Dressing Room

1. Seasonal introduction.
2. Four tactile season tabs, each with its own quiet color.
3. Look cards made from the user’s garment photos.
4. Empty states that guide the next action.

## 3. Component Rules

### Garment card

- Clothing photograph is the dominant element.
- Metadata sits below the image; no overlay on the clothing.
- “搭配” count is a soft sage label.
- Wear status uses sage when active and warm coral when the item needs attention.
- Hover movement is subtle and never crops or distorts the image aggressively.

### Wear efficiency

- Actual wear count is separate from the number of saved outfit ideas.
- “今天穿了” is the primary quick action and updates both count and last-worn date.
- Cost per wear is `price / wear count`; it stays pending until the item has been worn.
- Missing wear history and items unworn for at least 90 days are grouped as “待关注”.

### Archive lifecycle

- Pending items stay visible but do not show a final cost until their disposition is confirmed.
- A discarded item’s final usage cost equals its purchase price.
- A resold item’s final usage cost is `purchase price - resale price`.
- Final cost per wear is `final usage cost / wear count` when wear history exists.

### Season tab

- Always shows the Chinese season, English label, mood note, and count.
- Active state uses a dark outline instead of turning the whole component dark.
- Each season keeps its own color in both active and inactive states.

### Buttons

- Primary: butter background with dark ink text.
- Secondary: white/cream surface with a quiet ink border.
- Destructive actions remain text-only and understated until needed.

### Forms and drawers

- White card surfaces over the cream background.
- Comfortable spacing and rounded fields.
- Garment photos stay neutral and unfiltered.

## 4. Do / Don’t

Do:

- Keep clothing photos as the strongest color on the page.
- Use warmth through cream surfaces, butter highlights, and friendly copy.
- Treat small English labels as wardrobe tags.
- Use the four seasonal colors consistently.

Don’t:

- Add decorative gradients, glass panels, dark navigation, or technical charts.
- Use childish illustrations or excessive pastel decoration.
- Apply color filters to uploaded clothing photos.
- Add ornamental elements that compete with patterned garments.
