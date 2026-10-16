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
- Pen: tap anchors, drag to create curve handles, tap the first anchor to close. Finish path leaves an open path.
- Nodes: drag anchors or circular handles. Select anchors and use Corner, Round, or Symmetric.
- Pinch to zoom; two fingers pan. Pan and Fit buttons also work without gestures.
- Save SVG downloads editable vector paths. Open SVG replaces the drawing after confirmation.
- Refresh to test browser-local recovery. Download SVG before leaving a shared device. New clears the recovered drawing but can be undone during the session.

## Validation

```sh
npm run build
npx playwright install chromium
npm test
```

This is a prototype: rotation supports a draggable handle and a 15-degree button; alignment uses the last-selected object or the artboard. No region-based shape builder, layers panel, text, or offline service worker yet. Import is deliberately limited to vector SVGs and embedded PNG/JPEG/WebP/GIF images and rejects linked/active content. Browser recovery is best-effort localStorage and shared by users of the same browser profile. New SVG drawings are landscape US Letter with a transparent background. Test Safari and touch gestures on actual classroom iPads before relying on it for a lesson.

## Reversible shape building

Select two closed vector shapes and choose **Union**, **Subtract**, or **Intersect**. Subtract cuts the front shape out of the back shape. The result moves, resizes, rotates, duplicates, and changes style as one object. **Break Apart** restores the two original pieces with their original styles at the combined object's current transform. Nested combinations break apart one level at a time. Break apart before editing component nodes; combined outlines do not expose node editing. Image subtraction uses its existing crop workflow.

Each combined object exports as **one SVG path**. Holes and disconnected pieces become subpaths inside that path; the original overlapping boundaries do not export as additional cutting paths. Component geometry is stored in a non-rendering SVG `metadata` element, so reopening a saved SVG in Vector Lab preserves Break Apart. Browser recovery and undo/redo preserve it too. Other software can remove this metadata; the merged outline remains usable, but restoring its components then requires the original Vector Lab SVG copy. Existing merged paths without component data cannot be broken back into their original pieces.

## Editing aids

Fill and stroke open an inline palette with hex entry and hue/saturation/lightness sliders. Pen curves show their handles while drawing. Smooth nodes link opposite handles by default, preserving the opposite handle's length as you rotate the tangent; turn off **Keep smooth handles linked** for independent editing. **Corner**, **Round**, and **Symmetric** convert selected anchors.

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
- Z / Shift+Z: undo / redo; Control/Command+Y also redoes
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

On a trackpad, scroll with two fingers to pan horizontally or vertically over the canvas. Trackpad pinch zooms around the pointer when the browser reports it as a Ctrl+wheel gesture. Navigation does not change artwork or create undo steps. Undo and Redo preserve the current zoom and pan. After manual zooming or panning, toolbar and viewport resizes keep the view center and scale; use Fit or Return to page to reframe.

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
