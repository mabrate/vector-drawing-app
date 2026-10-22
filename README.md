# Vector Lab

A small touch-friendly vector editor for classroom iPads, hosted as a static GitHub Pages app. No accounts, server storage, or runtime CDN dependencies.

## Run locally

```sh
npm ci
npm run dev
```

Open the printed local address on this computer. To test on an iPad on the same Wi-Fi, use this computer's LAN IP and port 5173. Local firewall/network settings must allow the connection.

## GitHub Pages

Push this project to a GitHub repository with a `main` branch. In **Settings → Pages → Build and deployment**, select **GitHub Actions**. The included workflow builds and deploys `dist/`; relative asset URLs support repository subpaths. This checkout has not been published.

## Try it

- Drag out a rectangle and ellipse. Change their fill/stroke colors.
- Select an object and drag it. Use Select multiple to select two objects, then align or combine them.
- Subtract cuts the front object from the back object. Combine requires exactly two closed paths.
- Pen: tap anchors, drag to create curve handles, tap the first anchor to close. Finish path leaves an open path. Hold Ctrl/Cmd to snap segments and handles to 15° increments. Alignment guides remain available for targets reachable along the constrained segment.
- Nodes: drag anchors or circular handles. Select anchors and use Corner, Round, or Symmetric.
- Pinch to zoom; two fingers pan. Pan and Fit buttons also work without gestures.
- **File → Download editable PNG** saves a normal transparent PNG with editable artwork inside. **Insert image** offers **Editable shapes**, **Regular image**, or **Cancel** when that artwork is readable. Missing, damaged, or newer unsupported editing data falls back to a regular image. Other image tools may strip the editing data.
- The PNG uses a `VectorLab` tEXt chunk containing JSON with format `vector-lab.editable-png`, version `1`, and a base64 UTF-8 SVG. The reader validates the chunk checksum, size, envelope, and existing SVG import rules before offering editable import.
- Save SVG downloads editable vector paths. Open SVG replaces the drawing after confirmation.
- Refresh to test browser-local recovery. Download SVG before leaving a shared device. New clears the recovered drawing but can be undone during the session.

## Validation

```sh
npm run build
npx playwright install chromium
npm test
```

This is a prototype: rotation supports a draggable handle and a 15-degree button; alignment uses the last-selected object or the artboard. No region-based shape builder, layers panel, or offline service worker yet. Import is deliberately limited to vector SVGs and embedded PNG/JPEG/WebP/GIF images and rejects linked/active content. Browser recovery is best-effort localStorage and shared by users of the same browser profile. New SVG drawings are landscape US Letter with a transparent background. Test Safari and touch gestures on actual classroom iPads before relying on it for a lesson.

## Reversible shape building

Select two closed vector shapes and choose **Union**, **Subtract**, or **Intersect**. Subtract cuts the front shape out of the back shape. The result moves, resizes, rotates, duplicates, and changes style as one object. **Break Apart** restores the two original pieces with their original styles at the combined object's current transform. Nested combinations break apart one level at a time. Break apart before editing component nodes; combined outlines do not expose node editing. Image subtraction uses its existing crop workflow.

Each combined object exports as **one SVG path**. Holes and disconnected pieces become subpaths inside that path; the original overlapping boundaries do not export as additional cutting paths. Component geometry is stored in a non-rendering SVG `metadata` element, so reopening a saved SVG in Vector Lab preserves Break Apart. Browser recovery and undo/redo preserve it too. Other software can remove this metadata; the merged outline remains usable, but restoring its components then requires the original Vector Lab SVG copy. Existing merged paths without component data cannot be broken back into their original pieces.

## Editing aids

Fill and stroke open an inline palette with hex entry and hue/saturation/lightness sliders. Pen curves show their handles while drawing. A dashed preview follows the pointer from the last anchor, including curves and Ctrl/Cmd angle snapping. Hover over the first anchor to preview closing the path. With the **Pen** tool, hold **Ctrl** (or **Cmd** on Mac) when placing a point to snap the segment from the previous anchor to the nearest 15° angle. Hold the same key while dragging a curve handle to snap its direction to 15° increments. Release the key to draw freely; this works even when general snapping is off. Smooth nodes link opposite handles by default, preserving the opposite handle's length as you rotate the tangent; turn off **Keep smooth handles linked** for independent editing. **Corner**, **Round**, and **Symmetric** convert selected anchors.

**Snap** also makes new rectangles and ellipses square or circular when their width and height are close during dragging. Drag farther from equal proportions to release this snap; turn Snap off for free proportions.

**Snap** enables an 8-screen-pixel tolerance for object edges, centers, artboard edges/centers, and path anchors. Pink guides show alignment. Moving objects displays purple gap measurements in the selected units; a shape between two others can snap to equal spacing. Guides are temporary and never included in SVG exports.

Select: drag empty canvas to select fully enclosed objects. Select multiple (or Shift) adds to the selection. Eight handles resize the selected object or selection; corners resize both axes, edge handles resize one axis. Double-click an anchor in Nodes mode (double-tap on touch) to toggle smooth/corner. Snapping holds its current target through small movements to prevent rapid switching between nearby guides.

## Paper size, dimensions, and shortcuts

New drawings use landscape US Letter: **11 × 8.5 inches** (1056 × 816 internal SVG pixels). SVG downloads include physical inch dimensions so importing/printing at 100% preserves scale. Existing SVG page dimensions are read when opened; page size is also retained in browser recovery and undo.

Choose **inches, millimeters, pixels, or points** in the top toolbar, use **Dimensions → Selection / Artboard**, enter width and height, and click **Apply dimensions**. Selection dimensions refer to the geometric bounding box (excluding stroke), and resizing holds its top-left corner fixed. Changing artboard dimensions does not scale artwork. The conversion is 1 in = 25.4 mm = 96 px = 72 pt; pixels are document units, independent of the iPad screen density.

Keyboard shortcuts work with **Command on Mac/iPad keyboards** or **Control on Windows/Linux**:

- A: select all artwork
- D: duplicate selection
- C / X / V: copy / cut / paste editable vector artwork through the clipboard (SVG text)
- Z / Shift+Z: undo / redo; Control/Command+Y also redoes. While drawing with Pen, undo removes the last added node; after finishing, undo removes the completed path.
- Escape: deselect all objects and nodes, and cancel an unfinished Pen path. Enter finishes the Pen path.
- S: save SVG
- Delete / Backspace: delete selection

Text fields keep their usual select/copy/paste behavior. Pasted artwork is offset slightly so the new copy is visible. Plain-text SVG copied from another source can also be pasted; embedded PNG/JPEG/WebP/GIF images are supported; active content and linked resources are unsupported.

## Drawing, resizing, and rotation

- Hold **Ctrl** while drawing rectangles/ellipses for squares/circles; while resizing, Ctrl preserves the selection's existing aspect ratio (including edge handles).
- Hold **Shift** to draw around the starting point or resize around the selection's center.
- Combine **Ctrl+Shift** for constrained drawing/resizing from the center. Modifier keys can be changed during a drag.
- In Select mode, drag the green round handle above the selection to rotate freely around its center. The status bar shows the rotation angle. Multiple selected shapes rotate together. Rotation supports touch, undo, SVG saving, and reopening; the Rotate 15° button remains available.

Press **-** to zoom out and **=** (or **+**) to zoom in while working on the canvas. Zoom stays anchored under the cursor while it is over the canvas, and uses the center when no cursor is over the canvas. These keys keep their normal behavior in text and dimension fields.

X/Y/W/H fields display up to three decimal places; artwork keeps its full precision until a value is edited. The top toolbar stays one fixed-height row. Selection, node, text, and image controls extend it horizontally; scroll the toolbar to reach additional controls without moving the canvas.

## Precise positioning

Select artwork and use **X / Y → Apply position** to place the selection's geometric top-left corner relative to the artboard's top-left. Positions use the shared page inches/mm/px/pt units; negative coordinates are allowed. Multi-selection moves as a unit, preserving spacing. Artboard origin is fixed at X=0, Y=0. Position changes support undo and SVG saving.

**Arrow keys** use the page units: ⅛ in, 1 mm, 1 px, or 1 pt. **Shift+arrows** use 1 in, 10 mm, 10 px, or 10 pt, independent of zoom. Nudging bypasses snapping for exact placement. Inputs keep their usual text/number editing behavior.

## Two-finger navigation

On an iPad, drag two fingers across the canvas to pan; spread/pinch to zoom around your fingers. Adding the second finger cancels any unfinished shape move, resize, rotation, node edit, or new pen point from that gesture. Lift both fingers before drawing again.

On a trackpad, scroll with two fingers to pan horizontally or vertically over the canvas. Hold Shift while scrolling to pan horizontally. Click and hold the middle mouse button (scroll wheel), then drag to pan from any tool. Trackpad pinch zooms around the pointer when the browser reports it as a Ctrl+wheel gesture. Navigation does not change artwork or create undo steps. Undo and Redo preserve the current zoom and pan. After manual zooming or panning, toolbar and viewport resizes keep the view center and scale; use Fit or Return to page to reframe.

## Top toolbar and style controls

Toolbar icons open Fill and Outline, Align and Distribute, or Dimensions on the right. Snapping remains in the toolbar; the tool name and hint are below it. Alignment buttons have named tooltips. Snapping can be enabled globally or limited to edges, centers/equal spacing, and path anchors.

Both color pickers show colored slider tracks: the hue spectrum, saturation from gray to full color at the chosen hue/lightness, and lightness from black through the chosen color to white. Gradients update as you adjust the sliders.

Stroke width uses the shared top-toolbar **px / pt / mm / in** unit picker. Changing units converts the displayed number without changing the stroke. Entering a width applies only the stroke width to selected artwork; SVG exports preserve its physical scale.

The top-toolbar **Units** picker controls dimensions, X/Y positions, stroke width, artboard labels, drawing/resize measurements, and spacing labels together. Switching units converts displayed measurements without resizing artwork. The preference is remembered in this browser.

## Alignment reference, tool hints, and transparency

With multiple objects selected, alignment keeps the **last-selected shape fixed** and moves the others to its edges or center. The reference has a thicker green selection outline. A single selected object aligns to the artboard. For box selection or Select all, the last object in drawing order is the reference.

The active tool's instructions appear in a green strip below the top toolbar, matching the green active-tool button. Click **Snap ▾** for the enable switch and edge/center/node options; click outside or press Escape to close the dropdown.

Fill and stroke each have a **Transparency** slider: 0% is opaque; 100% is invisible. Checkerboard previews show transparency. These are independent color alpha values, retained by recovery, undo, clipboard, and SVG save/open.

Each color slider also has an editable number: hue in degrees (0–360), saturation/lightness/transparency in percent (0–100). Type a number or drag the slider; both stay synchronized. Fractional values are supported. Empty entries revert and out-of-range entries clamp when committed.


## Sidebar panels and node editing

The top toolbar opens **Fill and Outline**, **Align and Distribute**, and **Dimensions** panels. Raise/Lower move selected shapes one stacking level; Send to front/back move them to the ends, preserving the relative order of a multi-selection.

Alignment defaults to **Visible edges**, including centered stroke thickness and joins. Choose **Paths** for geometric bounds. Single shapes align to the page; multiple shapes align to the last selected. Distribution requires three shapes and offers equal horizontal/vertical gaps and equally spaced left/right/top/bottom edges or centers. Outer objects stay fixed; a crowded span can result in negative gaps (overlap).

The Nodes tool opens its settings automatically. Click an anchor, Shift-click or enable **Select multiple nodes** to add anchors, or drag empty space to box-select anchors on selected paths. Cmd/Ctrl+A selects all anchors on those paths. Selected nodes are larger, bright pink squares with dark outlines. Dragging selected anchors moves them together; arrow keys nudge them in the page units. Anchors, curve handles, hit testing, and node selection boxes follow the transformed path geometry, including rotated/scaled paths and compound paths, at any zoom.

- **Corner:** first changes smooth/symmetric handles to independent handles without moving them; clicking Corner again removes both handles.
- **Round:** keeps opposite handles on one tangent, allowing different lengths.
- **Symmetric:** keeps opposite handles aligned and equal in length.

Double-click/double-tap cycles through these corner stages and back to round. Node modes persist in browser recovery and SVG metadata; other editors may ignore this metadata while preserving the actual curve geometry.

### Images and cropping

Use **Insert image** for PNG, JPEG, WebP, or GIF files, or paste an image from the clipboard while the canvas has focus. Images are embedded in saved SVGs; no upload or external image URL is required. Animated images use a still frame.

Select one image and choose **Crop** (left toolbar or Dimensions). Drag a rectangle over the image to keep that area; release to apply. Dragging works in either direction and follows rotated images. **Reset crop** restores the complete image. Exact edge percentages remain available under **Crop menu**. Cropping is nondestructive: original pixels remain embedded, including cropped areas. Cropping, image placement, copying, and sizing support undo and browser recovery. Files are limited to 15 MB each; SVG imports to 30 MB. Large images can exceed browser-local recovery storage, so keep SVG copies.

Click empty artboard or background space to clear the selection, including with multiple selection enabled. Dragging empty space still box-selects objects or nodes.

In Nodes mode, image objects do not intercept clicks or node-selection boxes. Select a path, then drag over the image or inside the path to select enclosed nodes; Shift adds to the current node selection. Use Select mode to select or move an image.

### Blob brush

Choose **Blob** (shortcut **L**), pick a **Fill** color and **Brush size (px)**, then draw. **Smoothing** defaults to 100% and ranges from 0–200%; increase it for steadier curves and fewer nodes, or decrease it to retain more hand-drawn detail. A tap makes a round dot. On release, the brush creates a closed, filled vector path and unites closed paths touched by the stroke into that shape, using the brush color. Separate shapes, open outlines, and images stay separate. Compound holes are retained wherever the brush has not painted over them.

Mouse, pen, and touch work. A cancelled stroke or a two-finger gesture discards the preview. Undo restores all merged artwork in one step; the result supports node editing and SVG saving. Brush size is in document pixels and remains consistent while zooming.

### Paint bucket

Choose **Bucket** (shortcut **B**), set the **Fill** color, and click an enclosed vector area. The bucket creates a separate editable path without changing the original artwork. It supports traced bitmap paths, holes and overlapping shapes, Undo/Redo, and SVG saving. Choose Select to move or edit the resulting fill.

Closed vector shapes retain their original curves. Enclosures formed by several open paths use a bounded, document-resolution trace, so those fills approximate the boundary. Gaps must be closed; unbounded areas are rejected. Raster images are not bucket boundaries—trace an image into paths first.

### Dropper

Choose **Dropper** in the left toolbar. Click to sample a single point, or drag from the center of a circle to its edge to average all rendered pixels inside it. The circle is visible while dragging; release applies the color. Choose **Fill** or **Outline** in the dropper settings. Selected vector shapes receive the sampled color; otherwise it becomes the color for the next shape. Images remain unchanged.

Sampling combines visible images and vector artwork against the white artboard, including transparency as displayed. It excludes selection handles and guides, and ignores pixels outside the artboard. Results are opaque RGB colors; the circle never appears in saved artwork. A second finger cancels sampling and pans/zooms normally.

### Trace an image to editable paths

Select one image, then choose **Trace image** beside the crop and background removal controls. The modal compares the visible image with its vector preview. **Convert to paths** replaces the image in place; Undo restores it. Tracing runs locally in a browser worker, so adjusting settings or canceling does not upload the image or change the artwork.

**Solid silhouette** captures the whole visible subject, including light colors and white eyes. Transparent images use their alpha shape; opaque images use the dominant plain background connected to the image border. **Background tolerance** adjusts that removal. Busy photo backgrounds need **Remove background** or Include/Exclude corrections first; the dialog warns when no reliable plain background exists. **Cutout outline** makes a hollow, filled vector band around the subject; **Outline width** is a percentage of the image's shorter side, independent of preview resolution. Both modes preserve real transparent cutouts and support touch-up brushes.

Use the preview **+** and **−** buttons or scroll over either preview to zoom both together, up to 800% of the fitted view. Choose **View only** and drag either preview to pan, including on touchscreens. **Fit** restores the full image. Touch-up brushes follow the zoomed image, and preview navigation does not change the output size.

Choose **Pixel art** to turn an image into crisp, editable colored rectangles. **Pixel sizing** offers **Pixels on longest side** (16–128) or **Consistent block size** (1–256 px). For game assets, set each image to its intended game size, choose Consistent block size, and use the same block size for every image. For example, 8 px blocks give a 160 × 80 px image a 20 × 10 grid, regardless of its original resolution. Trace settings carry over between images and browser sessions; Reset defaults restores the original settings. Resizing paths afterward also resizes their blocks. Transparent margins are skipped when fitting the grid, without moving or stretching the subject; edge blocks may be partial. Maximum colors (2–16) and Leave white empty remain available. The preview updates locally, and Undo restores the source image. Extremely dense grids ask for a larger block size before conversion.

Color traces start with Balanced detail unless you have explicitly chosen another complexity setting, and default to **Stack colors to hide seams**. Filled layers overlap beneath later colors, preventing anti-aliased transparent hairlines between neighboring regions. No SVG outline strokes are added. Turn stacking off when you need separate, non-overlapping color regions. The existing **Edge smoothing** control keeps detail at lower values; above 70%, it increasingly removes small pixel bumps and fits broader curves. Corners, narrow features, and shared color boundaries are protected. Curves are checked against the cleaned boundary and refined when they stray too far. Use Balanced or Detailed for small color features that Simple's manufacturing node budget must simplify.

The default **Black and white / Simple** trace creates black filled shapes with the white background left empty. Inner openings become actual holes in the compound path. Threshold controls which tones count as dark; **Trace light areas instead** reverses this choice. **Remove small specks** removes tiny islands and holes, with the number removed shown below the preview.

The detail settings use these application limits:

| Setting | Maximum nodes | Maximum outlines, including holes |
| --- | ---: | ---: |
| Simple (default) | 1,000 | 120 |
| Balanced | 2,000 | 240 |
| Detailed | 5,000 | 500 |

Simple is the starting point for student Tinkercad and cutting projects. The tracer removes redundant nodes and simplifies contours to the selected node budget. If the remaining trace exceeds either limit, conversion stays disabled: increase speck removal, reduce colors, or choose a higher limit. Large regions are never silently discarded to fit a budget. These limits are this app's defaults, not documented Tinkercad limits.

**Colors** reduces the image to at most 2, 4, 8, 12, or 16 colors, creating a separate editable path for each used color. **Leave white empty** is enabled initially. This mode is useful for illustrations and game assets.

Tracing includes the image's current crop, shape intersections/subtractions, and background transparency. Position, scale, and rotation are baked into the new geometry. Save SVG after conversion to export ordinary closed paths, with no embedded image, clipping mask, or outline stroke from the traced image. The trace is a simplified 2D silhouette, not an STL generator, photographic reconstruction, or centerline trace. Check the size and small features in your destination app before fabrication; an actual Tinkercad import is not covered by the automated tests.

#### Refine a silhouette without raising the threshold

Enable **Fill enclosed holes** to turn interior white patches into solid geometry while leaving the outside background alone. It is off by default to preserve genuine cutouts. Transparent image cutouts remain empty unless explicitly included with a brush. An opening connected to the outside background is not an enclosed hole: close the gap or paint the missing area with Include.

Under **Touch up the trace**, choose a tool and paint on either preview:

- **Include brush:** add missing parts, regardless of threshold.
- **Exclude brush:** remove shadows or unwanted areas, including shadows attached to the subject.
- **Remove spot:** click a connected traced shape to remove it. Use this for disconnected artifacts; an attached shadow belongs to the subject's connected shape and should be brushed out instead.
- **Erase marks:** restore automatic tracing in a painted area.

Green marks show inclusions and pink marks show exclusions on the source preview. The source pixels stay unchanged. Corrections remain in place when threshold, noise removal, color mode, or detail changes; explicit exclusions remain empty even with hole filling enabled. **Undo edit** reverses the last stroke or spot removal (up to 12 edits); **Clear marks** removes manual corrections, and can itself be undone. **Reset all** restores the initial settings and clears correction history. Touch/pointer cancellation discards an unfinished stroke. Canceling the modal leaves the artwork unchanged; applying creates the corrected closed vector paths with the existing complexity limits and editor Undo.


#### Smooth tracing for flat color artwork

**Edge smoothing** defaults to 70%. It softens pixel stair steps and fits editable Bézier curves while retaining sharp corners. Shared color boundaries are fitted together so adjoining colors meet. The preview and applied/exported paths use the same curve geometry, and curve anchors still count toward the existing node limits.

For a flat illustration with 5–10 colors, start with **Colors**, a maximum of **8** or **12** colors, and smoothing around **70%**. The palette prefers stable color regions and consolidates rare near-identical edge shades instead of turning antialiasing into extra color bands. Edge cleanup also avoids assigning blended border pixels to unrelated palette colors. Small color flecks are replaced with their surrounding region rather than cut out as holes.

Lower smoothing to retain tiny angular details; **0%** keeps straight-line tracing. Higher Detail increases the sampling resolution and node budget; it is separate from edge smoothing. Original SVG artwork can also be opened directly with **Open SVG**, avoiding raster tracing entirely.

### Group and ungroup objects

Select two or more objects and click the **Group** icon in the top selection toolbar, or press **Ctrl+G** / **Cmd+G**. Groups move, resize, rotate, and duplicate as one object while preserving their members' geometry, colors, and stacking order. Groups can contain shapes, text, images, or other groups.

Select a group and click **Ungroup**, or press **Ctrl+Shift+G** / **Cmd+Shift+G**, to release one level of members in place. Ungroup nested groups again to reach their individual objects. Ungroup before editing individual path nodes. Image crop masks and reversible shape operations stay intact. Both actions support editor Undo, browser recovery, SVG save/open, and copying. Shortcuts are ignored while typing or while a dialog is open.

### iPad toolbar and sharing

On portrait tablets, **Properties** opens a drawer over the canvas instead of permanently taking up drawing space. Landscape keeps the sidebar visible. Touch controls have larger tap targets, related actions have subtle dividers, and arrow buttons at the toolbar edges reveal additional controls when the row overflows. The arrows disappear at the ends. Swipe the toolbar or tap an arrow; scrolling the controls does not move the artwork. Long-press an icon or menu control to see its explanation, including its keyboard shortcut when one exists.

**Save SVG** opens a filename field and the prepared SVG actions. On browsers that support sharing SVG files, **Share SVG…** opens the native share sheet, where the iPad can offer AirDrop, Save to Files, and other destinations. The app cannot select a destination or recipient automatically. Sharing uses the same self-contained SVG as **Download SVG**, including embedded images and reversible shape metadata when applicable. Canceling the share sheet keeps the prepared file and drawing available.

Native sharing requires a secure context, normally HTTPS (for example, GitHub Pages). A plain HTTP classroom-LAN address may not support it. When SVG sharing is unavailable or fails, use **Download SVG**, then share the downloaded file from Files. The filename is remembered locally and updated when opening an SVG. Actual native share destinations depend on the device and its settings; verify AirDrop and Save to Files on a classroom iPad.

### Rotation snapping

Drag the round rotation handle to rotate a selection around its center. Mouse rotation stays smooth; hold **Ctrl** for 15° steps, including while a drag is already in progress. Releasing Ctrl returns to smooth rotation.

With touch or Pencil, rotation starts in 15° steps. Drag farther away from the shape to switch to 1° precision, or move closer to return to 15° steps. The floating readout shows the current angle and mode. These are increments relative to the start of the current drag. Canceling the touch gesture restores the original artwork, and completed rotations support Undo and SVG reopening.

### Arithmetic in dimension fields

The X, Y, W, and H fields accept arithmetic, including the size inputs beside selected artwork and in the Page menu. For example, enter `105.765 + 0.25`, `200 * 1.5`, or `(100 + 25) / 2`, then press Enter or use the field's usual apply behavior. Results use the current page units and replace the expression with the calculated value. Matching labels such as `x = 105.765 + 0.25` are also accepted.

Supported operators are `+`, `-`, `*`, `/`, and parentheses; pasted `−`, `×`, and `÷` also work. Invalid expressions, division by zero, and invalid sizes leave the artwork unchanged. On touch devices these fields use the full keyboard so operators can be entered.

## Repairing and simplifying paths

In **Nodes**, double-click an outline (double-tap on touch) to insert an anchor without changing its curve. Double-clicking an existing anchor still toggles its corner/smooth behavior.

Select two open-path endpoints with **Multiple**, then choose **Join endpoints**. Endpoints from separate paths are connected by a straight segment; coincident endpoints merge into one anchor. The result retains curve geometry and uses the first endpoint’s path style. Selecting both ends of one path closes it. **Close path** connects the ends of each selected open path with at least three nodes.

**Simplify…** overlays a pink preview and shows the before/after node count. Adjust tolerance in document pixels, then **Apply** or **Cancel**. Higher tolerance permits more shape changes; small details and holes should be checked before applying. Repair and simplification support Undo and editable SVG saving. Editing a combined outline clears its Break Apart history; Undo restores it.

## Everyday color palette

Fill and Stroke include **No fill / No stroke**, shown with a red slash on the color button. These remove paint rather than making it transparent, retaining the current color for later use. Choose a preset to restore an opaque color. The palette includes neutrals, common bright colors, greens and blues, browns, cream, and several skin tones; each swatch has a color name. Custom hex, HSL, and transparency controls remain available. New drawings start with blue fill and charcoal outlines.

## Stroke endcaps and line patterns

In **Fill and Outline**, choose **Flat**, **Round**, or **Square** endcaps, and **Solid**, **Dashed**, or **Dotted** lines. Endcaps affect open line ends and individual dashes. Dotted lines use round caps automatically. Preset dash and dot spacing follows stroke width; imported custom SVG dash patterns are preserved. These styles apply to selected artwork or the next shape, support Undo, and survive SVG saving/reopening.

## Fillets and chamfers

In **Nodes**, select a sharp corner between lines or Bézier curves, then choose **Fillet** (round). **Chamfer** (bevel) is available between straight segments. Enter a **Radius** or **Distance** in the selected page units (in, mm, px, or pt). Changing units converts the displayed amount without changing the corner. Use **Apply corner**, or adjust the slider for a live preview. The controls extend the scrolling node toolbar. Multiple selected corners can be treated together.

Other anchors and the remaining lines and curves keep their shape. Curved fillets find a circular arc tangent to both sides and split the original Béziers exactly at its contact points. The search stays within the nearer half of each adjoining segment. If a requested curved radius does not fit, the artwork stays unchanged and a message asks for a smaller radius. Straight-line treatments stop at half the shorter adjoining edge to prevent neighbouring treatments from overlapping. Select either generated tangent node to adjust that corner again; **Restore sharp corner** returns to its original geometry. Endpoints and already smooth nodes are excluded. Curved chamfers are not supported.

Corner settings support Undo, local recovery, copy/paste, and SVG save/reopen. SVGs contain ordinary paths plus editing metadata. Moving, rotating, and resizing the object preserve corner settings; changing its individual nodes, handles, or topology turns the path into ordinary editable geometry. Undo restores the settings.

Applying background removal automatically crops empty edges around the remaining pixels while preserving the subject’s size, position, rotation, and existing crop restrictions. The crop retains the full raster; Reset crop restores its bounds, and Undo restores both the removed pixels and previous crop. Fully transparent results keep the previous bounds because there is no visible subject to fit.

Background and trace settings are saved locally in this browser, including modes, color/detail controls, brush sizes, and preview preferences. Cancel keeps these preferences without changing the artwork. Each dialog has **Reset defaults**, which also saves the reset for future sessions. Image-specific selections, touch-up marks, and preview zoom start fresh for each image; resetting defaults preserves current selections and marks.

Background removal preview supports **+ / −** keys and buttons, **Ctrl+scroll**, and **pinch** zoom. Drag with two fingers to pan; **Fit preview** resets the view. Brush size stays constant on screen for finer image edits when zoomed in.

## Text formatting and wrapping

The **Formatting** sidebar contains text content, font, size, Bold/Italic/Underline icon buttons, letter and line spacing, and left/center/right alignment icons, followed by fill and outline. Text controls appear when Text is active or one text object is selected. Arimo, Tinos, and Cousine (regular, bold, italic, and bold italic) are bundled locally. The font picker also offers 17 curated downloadable families.

With Text selected, **click** to place ordinary text or **drag** to define a wrapping text box width. Height grows automatically. Edit the original text in the sidebar; explicit paragraph breaks remain intact. Turn on **Wrap in text box** for existing text, set **Box width** in the document units, and choose **Apply text**. Changing that width reflows text; ordinary selection resize handles continue to scale artwork. Alignment buttons, font choices, and Bold apply directly to a selected text object.

Editable SVG saves preserve the source text, wrapping width, and rendered lines through reopen, clipboard, grouping, recovery, and undo. SVG lines use positioned `tspan` elements. Text-to-path export supports all curated families. Other editors may discard the custom wrapping metadata; the visible line layout remains in the SVG. Use outlined export when the receiving application does not have the fonts.

## Curated font picker

**Formatting → Font** opens a searchable picker with each name rendered in its own font. There are exactly **20 choices**, with no full Google Fonts catalog:

- **Included basics:** Arimo (Arial-compatible sans serif), Tinos (serif), Cousine (mono).
- **Signs and explainers:** Roboto, Atkinson Hyperlegible, Nunito, Oswald, Bebas Neue.
- **Chunky lettering:** Anton, Bungee, Lilita One, Archivo Black, Baloo 2.
- **Games:** Press Start 2P, Black Ops One, Orbitron, VT323.
- **Fun and handwriting:** Fredoka, Chewy, Patrick Hand.

Only the three basics ship as complete fonts. Font-name previews are small local subsets (under 100 KiB combined), loaded only as rows become visible, with at most three simultaneous loads. Choosing one of the 17 extra families downloads the selected regular, bold, italic, or bold-italic style directly from Google Fonts. Downloaded styles are stored in IndexedDB for offline reuse, including after reload; **Available offline** filters by the current bold/italic choice. A different style may still require a first download. Browser storage can be cleared or evicted, so these downloads are not a permanent backup. When storage is unavailable, the picker explains that the font is available only for this session.

New documents use Arimo. Older drawings using the previous Vector Lab font names migrate to Arimo, Tinos, or Cousine. Their letter shapes and metrics may differ. Fonts are loaded only when needed by artwork or a selection. SVG reopening/recovery reloads required fonts from local files or the saved browser font cache; fonts not previously downloaded need a connection. Editable SVGs reference font names and preserve text layout, but do not embed full font files. Outline text during export for appearance that travels between computers.

Redistribution licenses for all name previews and bundled basics are under `public/fonts/licenses`, without duplicate license copies beside each font. Chunky fonts are useful starting points for 3D designs, but disconnected dots, counters, and thin strokes still need checking for the intended fabrication process.

To refresh the curated catalog URLs, the three basics, name previews, and licenses, explicitly run `python3 scripts/update-font-catalog.py` with internet access. This maintenance step needs no API key and does not add the rest of Google Fonts or retain the full files of the 17 downloadable families.

## Text styles, spacing, and selected export

**Bold**, **Italic**, and **Underline** are toggle buttons in Formatting. They apply directly to selected text and set the style for the next text object. Bold is unavailable when a family has no bold weight. Italic uses a real face when the font provides one; otherwise a 12-degree slant works without another download and is preserved by outline export. Underlines also become vector geometry in simple-path exports.

**Letter spacing (pt)** adds space between glyphs; negative values tighten lettering. **Line spacing (×)** multiplies the text size, with 1.2× as the default. Edit those values and choose **Apply text**. Letter spacing participates in word wrapping, and line spacing determines the distance between baselines. All formatting is retained by undo, recovery, copy/paste, and editable SVG save/reopen. Formatted canvas text and outlined SVGs share the same glyph layout so transforms and spacing remain consistent.

In **Save SVG**, enable **Export selected objects only** to save just the current selection, including selected groups. Its SVG page fits the visible geometry and stroke bounds of those objects. Leave it unchecked for the whole drawing at the current artboard size. The option is disabled when nothing is selected and works with either editable SVG or simple-path export, download, and sharing.

Choose **File → Export PNG** to download the full page as a PNG with a transparent background. Page dimensions in pixels determine the image size (rounded to whole pixels). Artwork outside the page is clipped; editor controls and selection handles are excluded. Text is rendered with the drawing’s fonts. The PNG uses the current drawing name.
