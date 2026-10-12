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

## Editing aids

Fill and stroke open an inline palette with hex entry and hue/saturation/lightness sliders. Pen curves show their handles while drawing. Smooth nodes link opposite handles by default, preserving the opposite handle's length as you rotate the tangent; turn off **Keep smooth handles linked** for independent editing. **Corner**, **Round**, and **Symmetric** convert selected anchors.

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

Press **-** to zoom out and **=** (or **+**) to zoom in while working on the canvas. These keys keep their normal behavior in text and dimension fields.

## Precise positioning

Select artwork and use **X / Y → Apply position** to place the selection's geometric top-left corner relative to the artboard's top-left. Positions use the shared page inches/mm/px/pt units; negative coordinates are allowed. Multi-selection moves as a unit, preserving spacing. Artboard origin is fixed at X=0, Y=0. Position changes support undo and SVG saving.

**Arrow keys** use the page units: ⅛ in, 1 mm, 1 px, or 1 pt. **Shift+arrows** use 1 in, 10 mm, 10 px, or 10 pt, independent of zoom. Nudging bypasses snapping for exact placement. Inputs keep their usual text/number editing behavior.

## Two-finger navigation

On an iPad, drag two fingers across the canvas to pan; spread/pinch to zoom around your fingers. Adding the second finger cancels any unfinished shape move, resize, rotation, node edit, or new pen point from that gesture. Lift both fingers before drawing again.

On a trackpad, scroll with two fingers to pan horizontally or vertically over the canvas. Trackpad pinch zooms around the pointer when the browser reports it as a Ctrl+wheel gesture. Navigation does not change artwork or create undo steps.

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

The Nodes tool opens its settings automatically. Click an anchor, Shift-click or enable **Select multiple nodes** to add anchors, or drag empty space to box-select anchors on selected paths. Cmd/Ctrl+A selects all anchors on those paths. Selected nodes are larger, bright pink squares with dark outlines. Dragging selected anchors moves them together; arrow keys nudge them in the page units.

- **Corner:** first changes smooth/symmetric handles to independent handles without moving them; clicking Corner again removes both handles.
- **Round:** keeps opposite handles on one tangent, allowing different lengths.
- **Symmetric:** keeps opposite handles aligned and equal in length.

Double-click/double-tap cycles through these corner stages and back to round. Node modes persist in browser recovery and SVG metadata; other editors may ignore this metadata while preserving the actual curve geometry.

### Images and cropping

Use **Insert image** for PNG, JPEG, WebP, or GIF files, or paste an image from the clipboard while the canvas has focus. Images are embedded in saved SVGs; no upload or external image URL is required. Animated images use a still frame.

Select one image and choose **Crop** (left toolbar or Dimensions). Drag a rectangle over the image to keep that area; release to apply. Dragging works in either direction and follows rotated images. **Reset crop** restores the complete image. Exact edge percentages remain available under **Exact crop percentages**. Cropping is nondestructive: original pixels remain embedded, including cropped areas. Cropping, image placement, copying, and sizing support undo and browser recovery. Files are limited to 15 MB each; SVG imports to 30 MB. Large images can exceed browser-local recovery storage, so keep SVG copies.

Click empty artboard or background space to clear the selection, including with multiple selection enabled. Dragging empty space still box-selects objects or nodes.

In Nodes mode, image objects do not intercept clicks or node-selection boxes. Select a path, then drag over the image or inside the path to select enclosed nodes; Shift adds to the current node selection. Use Select mode to select or move an image.

### Dropper

Choose **Dropper** in the left toolbar. Click to sample a single point, or drag from the center of a circle to its edge to average all rendered pixels inside it. The circle is visible while dragging; release applies the color. Choose **Fill** or **Outline** in the dropper settings. Selected vector shapes receive the sampled color; otherwise it becomes the color for the next shape. Images remain unchanged.

Sampling combines visible images and vector artwork against the white artboard, including transparency as displayed. It excludes selection handles and guides, and ignores pixels outside the artboard. Results are opaque RGB colors; the circle never appears in saved artwork. A second finger cancels sampling and pans/zooms normally.
