# Vector Lab

A small touch-friendly vector editor for classroom iPads, hosted as a static GitHub Pages app. No accounts, server storage, or runtime CDN dependencies.

## Run locally

```sh
npm ci
npm run dev
```

Open the printed local address on this computer. To test on an iPad on the same Wi-Fi, use this computer's LAN IP and port 5173. Local firewall/network settings must allow the connection.

## 3D modeling

Open **3D model…** for the modeling workspace. Every vector path in the drawing appears in **Drawing paths**, including paths inside groups; compound paths retain their holes. Open or unsupported paths explain why they cannot be extruded. You can also select artwork in the drawing and use **Extrude…** to open the Extrude tool with those paths selected.

Choose one tool from the toolbar: **Extrude**, **Join**, **Cut**, **Shell**, **Chamfer**, **Fillet**, **Texture**, or **Cylinder seal**. Only that tool’s settings are shown. Select its geometry in the preview or the object list, set dimensions, and click **Preview**. **Apply [tool]** adds the result to the session’s feature history. **Edit selection** returns to the geometry before the operation, retaining your selected inputs; **Cancel tool** discards the current operation. Dimension changes update an existing result preview automatically. Selecting another tool discards an unapplied operation.

**Extrude** creates a solid from one or more drawing paths. **Join** and **Cut** extrude selected paths into or out of a target body. Use **Pick → Target body**, the body list, or the Target body menu to choose that body. Path picking reaches the XY drawing plane even beneath a solid. Use **Hide/Show** beside paths and bodies, or **Hide all/Show all**, to expose overlapping geometry. Hidden objects cannot be picked. Visibility belongs to this workspace session only: it does not change the artwork, the model recipe, or CAD exports. **Fit** frames visible objects.

All source paths use the XY plane; extrusions extend along +Z. Height and starting height use the chosen units. Positive draft tapers inward and negative draft expands outward. Drafted circles use true conical walls, recognizing the standard four Bézier arcs produced by circle tools and SVG import. The starting diameter stays fixed; the radius changes by `height × tan(draft angle)` at the top. Positive draft shrinks the exterior and expands circular holes. Dimensions that close a circle, hole, or intervening wall are rejected. Ellipses and other spline outlines depend on the CAD kernel’s draft support.

Choose **Shell** to hollow a body. Tap its opening faces in the preview or check them in the face list, including faces at the back. Set **Wall thickness** and choose **Inside original solid** (preserves outside dimensions) or **Outside original solid** (preserves the cavity). One open cap makes a cup; both cylinder caps make a tube. Side faces and multiple openings are supported; leave at least one face for the walls. Preview, then **Apply shell**. Unsupported offsets, including some tapered surfaces, report an error and cannot be applied.

For **Chamfer** and **Fillet**, choose a named rim or junction in the boundary list, or tap near its line in the preview. The list defaults to design/base junctions when available; use **Upper rims**, **Lower rims**, or **All boundaries** to find other loops. **All junctions/rims at Z …** selects or clears every listed boundary at that height on the target body. Hover or keyboard-focus a name to preview it in blue; click/tap or press Enter to select it. Selected edges have a thick pink highlight visible through the body, and **Zoom to selection** frames them without changing the model. Missed taps keep the selection; use **Clear edges** to reset it.

Preview picking uses screen distance with a 12 px mouse/pen target and a 24 px touch target. Whole-boundary mode slightly favors recognized rims over nearby short side facets; occluded edges are excluded. **Other edges / individual pieces** contains the full edge menu and **Individual edges** mode. **Connected in plane** selects a coplanar chain; separate holes, heights, and bodies stay separate. Join extrusions before treating their shared junction. Chamfers use equal distances on adjacent faces.

Chamfer identifies complete outside rims, hole rims, raised-design/base junctions, and cavity junctions. The edge menu names recognized boundaries and their height. The tool reports available wall height, nearby-boundary clearance, and short segments; **Highlight short segments** marks those pieces in orange without changing the selection. A size that would reach a neighboring hole, wall, or supporting base edge is rejected before applying. Partial contours and drafted/curved walls use the native CAD operation. Complete upper contours on nearly vertical walls can use a contour bevel; complete contours containing short segments use that method first, without a fixed edge-count cutoff. Multiple complete contours can be selected together.

**Prepare contour for chamfer** optionally simplifies only the selected boundary within 0.01 mm, reserving error for curve sampling. It does not replace or decimate the imported mesh. Preparation is preview-only until **Apply chamfer** and is stored in feature history, recovery, and editable SVG. Standard contour bevels have 0.02 mm surface tolerance; prepared bevels report 0.03 mm. Their STEP surface is finely faceted. Unsupported preparation or invalid geometry leaves Apply disabled.

**Check smaller sizes** tests up to three alternatives against the complete feature history and watertight preview mesh. It changes no dimensions until you choose **Preview …**; that preview still requires Apply. If no checked alternative works, select a different boundary or try preparation. Failed attempts retain the last valid view and all settings. Solid validity, material direction, body bounds, and watertight winding are checked; chamfered STL downloads receive a separate watertightness check at export resolution.

Complete recognized contours save an intent relative to their target body. When source edits replace their CAD edges, the chamfer can follow a uniquely matching boundary after translation or resizing. Ambiguous matches and individual/partial legacy selections require reselection; the model never silently chooses among multiple matching contours. The preview reports when a contour followed changed source geometry.

Calculations show stages and provide **Cancel calculation**. A two-minute deadline stops stalled work and offers Retry while preserving the session and settings. Unchanged geometry before the first edge treatment is cached inside the worker; changes to source geometry or units invalidate that cache. A failed preview keeps the valid input geometry available for another attempt.

Choose **Texture** for raised or engraved printable geometry on flat faces. Select surfaces in the preview or face list, choose **Ribs**, **Round studs / dimples**, or **Square studs / pockets**, then set height/depth, width/diameter, center-to-center spacing, and angle. Width must be smaller than spacing. Patterns are clipped to the selected face boundaries and holes; they add or subtract actual solid material, included in STL and STEP exports. Use separate Texture actions to put different patterns on different surfaces. Up to 16 flat faces and 256 pattern elements are supported per action; increase spacing for dense patterns. Curved faces currently cannot receive a wrapped texture. Texture features remain editable through Preview, Apply, Cancel, feature history, Undo, browser recovery, and editable SVG save/open.

Choose **Cylinder seal** to wrap drawing artwork into an engraved rolling seal. Insert an image through the normal image workflow, or draw a path, then choose it under **Artwork**. The displayed artwork width becomes the circumference (diameter = width ÷ π), and its height becomes the cylinder height. **Around repeats** adds full-size copies and enlarges the diameter; **Vertical repeats** adds rows and enlarges the height. Increasing **Diameter** adds a blank section around the cylinder without stretching the artwork. **Fit diameter to artwork** removes that extra space. Repeat counts range from 1 to 16 in each direction. **Top margin** and **Bottom margin** add separate blank bands above and below the repeated artwork. Total height is artwork height × vertical repeats + both margins. Margins extend the cylinder without stretching or cropping the pattern; zero keeps the artwork at that end of the cylinder. Margin boundaries are represented explicitly, so even a margin smaller than the requested detail size stays blank.

**Relief** selects **Deboss · engraved** (cut into the cylinder) or **Emboss · raised** (added above the cylinder). These describe the cylinder; its impression has the opposite relief. Diameter always refers to the base cylinder. **Maximum height / depth** defaults to **1 mm** and can be changed; deboss depth must stay smaller than the cylinder radius. Under **Relief color**, **Darkest color** maps black to the maximum height/depth and white to zero; **Lightest color** reverses that mapping. Intermediate color values produce proportional depths using luminance, and transparent regions stay unengraved in both modes. **Mirror for a readable impression** starts enabled. Images retain their visible crop, shape clipping, scale, rotation, and transparency. Paths retain their fill, strokes, and holes, so a single path can supply a repeated pattern. Artwork is sampled into a saved grayscale/alpha snapshot of up to 1024 × 1024 pixels. Editing the original drawing later does not change the seal: choose the artwork again to refresh it.

For raised paths, set **Relief → Emboss** and use **Draft angle (°)** to taper sharp edges for upright printing. **0°** keeps the original relief; **45°** gives a 1:1 ramp, and larger angles up to **80°** make gentler slopes. The angle is measured from the radial relief direction. Draft lowers the edges inward within the original footprint, leaving a broad base and a narrower crest. It limits radial rise along the cylinder axis, including sharp corners and the wrap seam; print with the cylinder standing on an end. Top/bottom margins and transparent/blank areas stay blank. Thin features and small gaps between height changes can reduce the surviving relief height, so inspect the preview at the displayed sampling resolution. Draft works with the existing color-value relief, repeats, and mirroring in both Photo STL and CAD / STEP. It applies only to Emboss; Deboss keeps its engraving. Printer, material, layer height, and orientation still require checking in the slicer and a physical test.

New seals use **Photo STL · high detail**, which keeps the engraved surface as a closed printable mesh with up to **524,288 cells / 1,048,576 triangles**. **Use fine photo detail (0.05 mm)** sets a smaller sampling pitch; Photo STL accepts 0.02–5 mm. The tool reports the actual surface detail, artwork detail, triangle count, and whether the surface limit was reached. Smaller numbers mean finer detail; reducing the requested size cannot add information beyond the source image. Source snapshots use compact lossless grayscale/alpha storage. High-detail seals can be downloaded as STL and edited through their seal settings. Solid modeling tools and STEP export require **CAD / STEP**, which retains the earlier 4,608-cell CAD limit and 0.1–5 mm detail range. A model containing Photo STL seals disables STEP export; switching those seals to CAD / STEP enables it at CAD resolution.

Existing seals keep their saved mode and artwork snapshot. To improve an older seal, click its feature-history entry, choose **Refresh artwork at full resolution**, then **Use fine photo detail (0.05 mm)**, **Preview → Apply edit → Save model**. Refresh reads the current drawing image, retaining its crop and transforms; it preserves the diameter when the refreshed artwork still fits. If the original artwork is unavailable, choose replacement artwork first. Repeats, blank circumference, top/bottom margins, emboss/deboss relief, color polarity, maximum height/depth, and mirroring behave the same in both surface modes. Older seals default to Deboss with zero margins and no draft. Preview and inspect the engraving before printing. Preview/Apply/Cancel, feature-history editing, Undo, browser recovery, and full editable SVG preserve the source snapshot and seal settings. Physical printing and seal impressions require a test on the intended printer and material.

Set **Around gap** and **Vertical gap** in the cylinder-seal settings to leave blank space between repeats, in the selected units. Around gap also separates the last repeat from the first at the wrap seam, including when there is only one repeat. Vertical gap is added only between rows; top and bottom margins remain separate. Increasing gaps grows the cylinder without stretching the artwork and preserves any extra blank circumference from a larger diameter. Zero gaps retain the original repeat layout. Gaps are retained through Preview/Apply/Cancel, feature editing, Undo, browser recovery, editable SVG/PNG, and STL/STEP export.

Use **Import STL…** inside the workspace to load binary or ASCII STL, including models exported from Tinkercad. Choose the file units and check its displayed dimensions, then **Preview → Apply import**. The imported body can be selected for chamfers, fillets, shells, printable textures, and extrusion joins/cuts. Import merges coplanar triangles into CAD faces so triangle diagonals do not become editable edges; curved regions remain faceted. Chamfers have been checked on box, faceted-cylinder, and dense raised-design junction fixtures; conversion does not restore the original application's parametric shapes, and some meshes or edge treatments can still fail. The original mesh and scale are retained in the feature recipe and full editable SVG, so you can reopen the project and edit later actions. **Cancel tool** discards an import; removing its history entry also removes operations targeting it.

STL import accepts closed, orientable manifold meshes up to **10,000 triangles / 8 MB per file**, **32 disconnected shells per import**, and **20,000 imported triangles per model**. Invalid/open meshes need repair in the source app; the import does not fill arbitrary holes. Nested closed shells retain their voids. Millimeters are the default; inches and centimeters can be selected because STL carries no unit metadata. Keep the editable SVG as the master project: finely textured STL exports can exceed the import triangle limit even though their editable SVG recipes remain supported. All processing stays local.

Extrude, Join, and Cut features stay linked to their source drawing paths. Moving, resizing, rotating, or editing the nodes of those paths updates every linked profile in the same Undo step. The CAD engine checks the complete model in the background, including dependent cuts, joins, shells, chamfers, and fillets. A failed rebuild names the affected feature and offers **Undo path edit**, **Keep edit**, and **Repair in 3D**. If later edits were made while validation ran, the Undo button explicitly offers to undo the path edit and later changes; those changes remain available through Redo. Deleting a source, opening a closed path, or replacing its identity also warns. Broken models cannot be exported as CAD using stale cached profiles.

Click a **Feature history** entry to edit it with its original input geometry. Pick drawing paths to replace or repair that feature’s source links. Source identities survive Undo/Redo, browser recovery, and full editable SVG/PNG metadata; duplicates and inserted artwork cannot take over another path’s links. Older copied profiles are linked automatically only when their artwork matches unambiguously. Otherwise, select the intended source paths in the feature editor to establish the link. Earlier edits rebuild later features; changed edges or faces can invalidate later operations, which can be edited or selected again. Removing a body’s extrusion also removes operations targeting it. For a ready-made junction example, open [`examples/stepped-block-3d.svg`](examples/stepped-block-3d.svg): a 3 mm base, a 15 mm raised block, and a 1 mm chamfer around their shared junction.

**Save model** keeps the session in the drawing as one Undo step. The workspace’s outer **Cancel** discards the entire session, including tools already applied to its history. Model recipes survive browser recovery and full editable SVG save/open. Full editable PNG embeds the SVG recipe too, but inserting SVG/PNG artwork adds only its 2D shapes. Use **Open SVG** to restore an entire model. Selected-object exports and simple-path SVG carry 2D artwork only. **New** and opening another drawing replace the model and artwork. STL and STEP exports include all bodies, including hidden ones, in millimeters; STL is a printable mesh and STEP retains CAD solids; Photo STL seals use STL export. Neither export includes the editable feature recipe. Finish or cancel the active tool before saving or exporting.

The local CAD engine and viewer load only when opening 3D modeling. The CAD WebAssembly asset is approximately 23 MB before compression. No runtime CDN or remote modeling service is used. Dependency notices ship under `public/licenses/`. Desktop Chrome and emulated mobile checks do not replace real iPad/Safari testing; complex offsets, drafts, and intersections can be rejected by the CAD kernel.

## GitHub Pages

Push this project to a GitHub repository with a `main` branch. In **Settings → Pages → Build and deployment**, select **GitHub Actions**. The included workflow builds and deploys `dist/`; relative asset URLs support repository subpaths. This checkout has not been published.

## Try it

- Drag out a rectangle and ellipse. Change their fill/stroke colors.
- Select an object and drag it. Use Select multiple to select two objects, then align or combine them.
- Subtract cuts the front object from the back object. Combine requires exactly two closed paths.
- Pen: tap anchors, drag to create curve handles, tap the first anchor to close, or tap the last anchor to finish an open path. The last anchor is highlighted green while drawing. The Finish path button also leaves an open path. Hold Ctrl/Cmd to snap segments and handles to 15° increments. Alignment guides remain available for targets reachable along the constrained segment.
- Nodes: drag anchors or circular handles. Select anchors and use Corner, Round, or Symmetric.
- Pinch to zoom; two fingers pan. Pan and Fit buttons also work without gestures.
- **File → Download editable PNG** saves a normal transparent PNG with editable artwork inside. **Insert image** offers **Editable shapes**, **Regular image**, or **Cancel** when that artwork is readable. Missing, damaged, or newer unsupported editing data falls back to a regular image. Other image tools may strip the editing data.
- The PNG uses a `VectorLab` tEXt chunk containing JSON with format `vector-lab.editable-png`, version `1`, and a base64 UTF-8 SVG. The reader validates the chunk checksum, size, envelope, and existing SVG import rules before offering editable import.
- Save SVG downloads editable vector paths. Open SVG replaces the drawing after confirmation and switches to Select. Use Insert image to add SVGs to an existing drawing.
- Refresh to test browser-local recovery. Download SVG before leaving a shared device. New clears the recovered drawing but can be undone during the session.

## Validation

```sh
npm run build
npx playwright install chromium
npm test
```

This is a prototype: rotation supports a draggable handle and a 15-degree button; alignment uses the last-selected object or the artboard. No region-based shape builder, layers panel, or offline service worker yet. Import is deliberately limited to vector SVGs and embedded PNG/JPEG/WebP/GIF images and rejects linked/active content. Browser recovery is best-effort localStorage and shared by users of the same browser profile. New SVG drawings are landscape US Letter with a transparent background. Test Safari and touch gestures on actual classroom iPads before relying on it for a lesson.

## Reversible shape building

Open **Path** in the top toolbar for **Union**, **Subtract**, **Intersection**, **Offset Path**, **Stroke to Path**, and **Text to Path**. Select two closed vector shapes and choose **Path → Union**, **Path → Subtract**, or **Path → Intersection**. Subtract cuts the front shape out of the back shape. The result moves, resizes, rotates, duplicates, and changes style as one object. **Break Apart** restores the two original pieces with their original styles at the combined object's current transform. Nested combinations break apart one level at a time. Break apart before editing component nodes; combined outlines do not expose node editing. Image subtraction uses its existing crop workflow.

Each combined object exports as **one SVG path**. Holes and disconnected pieces become subpaths inside that path; the original overlapping boundaries do not export as additional cutting paths. Component geometry is stored in a non-rendering SVG `metadata` element, so reopening a saved SVG in Vector Lab preserves Break Apart. Browser recovery and undo/redo preserve it too. Other software can remove this metadata; the merged outline remains usable, but restoring its components then requires the original Vector Lab SVG copy. Existing merged paths without component data cannot be broken back into their original pieces.

## Editing aids

Fill and stroke open an inline palette with hex entry and hue/saturation/lightness sliders. Pen curves show their handles while drawing. A dashed preview follows the pointer from the last anchor, including curves and Ctrl/Cmd angle snapping. Preview movement updates at most once per animation frame without rebuilding selection controls. Hover over the first anchor to preview closing the path. With the **Pen** tool, hold **Ctrl** (or **Cmd** on Mac) when placing a point to snap the segment from the previous anchor to the nearest 15° angle. Hold the same key while dragging a curve handle to snap its direction to 15° increments. Release the key to draw freely; this works even when general snapping is off. Smooth nodes link opposite handles by default, preserving the opposite handle's length as you rotate the tangent; turn off **Keep smooth handles linked** for independent editing. **Corner**, **Round**, and **Symmetric** convert selected anchors.

**Snap** also makes new rectangles and ellipses square or circular when their width and height are close during dragging. Drag farther from equal proportions to release this snap; turn Snap off for free proportions.

**Snap** enables an 8-screen-pixel tolerance for object edges, centers, artboard edges/centers, and path anchors. Pink guides show alignment. Moving objects displays purple gap measurements in the selected units; a shape between two others can snap to equal spacing. Guides are temporary and never included in SVG exports.

Select: drag empty canvas to select fully enclosed objects. Hold **Shift before dragging** to start an additive selection box anywhere over artwork, including another shape’s fill or outline. Only fully enclosed objects are added; the shape under the starting point is not automatically selected or moved. Shift-click still adds/removes individual objects, and Shift-click on empty space keeps the current selection. Select multiple also adds to the selection. Resize and rotation handles keep their usual modifier behavior. Eight handles resize the selected object or selection; corners resize both axes, edge handles resize one axis. Double-click an anchor in Nodes mode (double-tap on touch) to toggle smooth/corner. Snapping holds its current target through small movements to prevent rapid switching between nearby guides.

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
- With touch input, corner resize handles preserve proportions automatically. Edge handles resize width or height independently; no keyboard is needed.
- Resizing vector shapes keeps their stroke width consistent, including grouped shapes, combined shapes, and editable corner treatments.
- Hold **Shift** to draw around the starting point or resize around the selection's center.
- Combine **Ctrl+Shift** for constrained drawing/resizing from the center. Modifier keys can be changed during a drag.
- In Select mode, drag the green round handle above the selection to rotate freely around its center. The status bar shows the rotation angle. Multiple selected shapes rotate together. Rotation supports touch, undo, SVG saving, and reopening; hold Ctrl while dragging for 15° steps.

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

With multiple objects selected, alignment keeps the **last-selected shape fixed** and moves the others to its edges or center. The reference has a thicker green selection outline. A single selected object aligns to the artboard. For box selection or Select all, the last object in drawing order is the reference. Releasing a selection box keeps the objects or nodes highlighted in its last drag preview, including on touch devices.

The active tool's instructions appear in a green strip below the top toolbar, matching the green active-tool button. Click **Snap ▾** for the enable switch and edge/center/node options; click outside or press Escape to close the dropdown.

Fill and stroke each have a **Transparency** slider: 0% is opaque; 100% is invisible. Checkerboard previews show transparency. These are independent color alpha values, retained by recovery, undo, clipboard, and SVG save/open.

Each color slider also has an editable number: hue in degrees (0–360), saturation/lightness/transparency in percent (0–100). Type a number or drag the slider; both stay synchronized. Fractional values are supported. Empty entries revert and out-of-range entries clamp when committed.


## Sidebar panels and node editing

The top toolbar opens **Fill and Outline**, **Align and Distribute**, and **Dimensions** panels. Raise/Lower move selected shapes one stacking level; Send to front/back move them to the ends, preserving the relative order of a multi-selection.

Alignment defaults to **Visible edges**, including centered stroke thickness and joins. Choose **Paths** for geometric bounds. Single shapes align to the page; multiple shapes align to the last selected. Distribution requires three shapes and offers equal horizontal/vertical gaps and equally spaced left/right/top/bottom edges or centers. Outer objects stay fixed; a crowded span can result in negative gaps (overlap).

The Nodes tool opens its settings automatically. Click an anchor, Shift-click or enable the **Select multiple** icon to add anchors, or drag empty space to box-select anchors on selected paths. Hold **Shift before dragging** to box-select nodes while keeping the current paths fixed, even when starting over another path’s fill or outline. Shift box selection adds to the selected nodes; Shift-clicking another path keeps the current path selection. Use **Select multiple** without Shift to add paths. Grouped artwork must be ungrouped before editing its anchors. Cmd/Ctrl+A selects all anchors on those paths. Selected nodes are larger, bright pink squares with dark outlines. Dragging selected anchors moves them together; arrow keys nudge them in the page units. Anchors, curve handles, hit testing, and node selection boxes follow the transformed path geometry, including rotated/scaled paths and compound paths, at any zoom.

Object stacking controls and the ruler are hidden in Nodes mode and return when another tool is selected. The **Select multiple** icon is shared by Select and Nodes: it adds shapes in Select mode, and adds both paths and individual nodes in Nodes mode.

- **Corner:** first changes smooth/symmetric handles to independent handles without moving them; clicking Corner again removes both handles.
- **Round:** keeps opposite handles on one tangent, allowing different lengths.
- **Symmetric:** keeps opposite handles aligned and equal in length.

Select two adjacent nodes and choose **Delete segment** to remove the line or curve between them while keeping both nodes. A closed path opens at that segment; an open path splits into two paths. The new endpoints remain selected for **Join endpoints**, and Undo restores the connection.

Double-click/double-tap cycles through these corner stages and back to round. Node modes persist in browser recovery and SVG metadata; other editors may ignore this metadata while preserving the actual curve geometry.

### Images and cropping

Use **Insert image** for SVG, PNG, JPEG, WebP, or GIF files, or paste an image from the clipboard while the canvas has focus. Images are embedded in saved SVGs; no upload or external image URL is required. Animated images use a still frame.

SVGs insert as editable groups, so each imported drawing moves and resizes together. Select several SVGs at once to combine them in the current project without changing the artboard. Use **Ungroup** to edit their individual shapes and nodes. SVGs fit to the page by default; the **Original pixel size** import option retains their document dimensions. Inserted SVGs support Undo, browser recovery, and SVG save/open.

Raster images fit to the page by default while retaining their source pixels. Use the arrow beside **Insert image** to choose **Original pixel size** before selecting files, or select an existing image and choose **Original pixel size** beside its crop controls. This restores one document pixel per source pixel while keeping the crop, rotation, and mirroring. Undo restores the previous placement. Large images may extend beyond the artboard: export selected objects to include the whole image, or use **Settings → Fit canvas to content**. Original pixel size refers to pixels, not the scan's printed dimensions or DPI.

Select one image and choose **Crop** in the left toolbar. Drag a rectangle over the image to keep that area; release to apply. Dragging works in either direction; the crop rectangle stays aligned with the canvas even when the image is rotated. **Reset crop** restores the complete image. Exact edge percentages and Reset crop appear in the top toolbar while the Crop tool is active. Cropping is nondestructive: original pixels remain embedded, including cropped areas. Cropping, image placement, copying, and sizing support undo and browser recovery. Files are limited to 15 MB each; SVG imports to 30 MB. Large images can exceed browser-local recovery storage, so keep SVG copies.

To crop an image to a shape, draw a closed shape (such as a circle or a closed Pen path) over an image. Use **Select multiple** to select both the image and shape, then choose **Intersect** in the shape-builder tools. Only the overlapping image area remains visible; the shape is consumed. The original pixels remain embedded, and Undo restores both objects. Shape cropping survives browser recovery and SVG save/open. Exact percentage crops and Reset crop retain the shape restriction. If the shape does not overlap the visible image, both originals are kept.


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

### Take a photo

Choose **Insert image ▾ → Take photo…**. Phones and iPads request the rear camera through the device's photo picker; availability depends on the browser. On a computer, allow camera access, frame the photo, then choose **Take photo → Use photo**. **Retake** starts another capture. If multiple cameras are available, choose one from the Camera list. **Choose photo…** opens the device picker when a camera is unavailable or permission is denied. Desktop camera preview requires HTTPS or localhost.

Photos stay on the device and enter the normal embedded-image workflow, including Undo, browser recovery, SVG, PNG, and editable PNG. Native camera photos are normalized for orientation and decoded into JPEG; photos larger than 8192 pixels per side or 32 million pixels are reduced to that limit. If the browser cannot decode a camera format, choose JPEG or PNG instead. The live camera stops after capture and whenever its dialog closes. Canceling a capture leaves the drawing untouched.

### Straighten an image

Select one image, choose **Crop** (shortcut **C**), then **Straighten…**. In **Level image**, drag along a horizon or text baseline to make it horizontal. Choose **Vertical** for an upright edge. The angle slider and degree field provide fine control. **Trim empty edges** previews a centered crop that removes the new corners left by rotation. Existing transparency or shape cutouts remain transparent. Leveling preserves the embedded source pixels and existing image masks.

For a page photographed at an angle, choose **Perspective / page corners** and drag corners 1–4 around the page, clockwise from its top left. A second preview shows the corrected rectangle. Focus a corner and use arrow keys for 1% adjustments, or Shift+arrows for 0.1%. Keep the corners in clockwise order. Perspective correction includes the visible crop and shape masks, and resamples those pixels in a local worker. It preserves the image's embedded source and original mask for **Restore original image**, including after SVG or editable PNG reopening. Restoring the original also restores its earlier crop and pixel adjustments; subsequent changes to the corrected pixels are discarded and can be recovered with Undo. Full-resolution correction supports up to 16,384 pixels per side and 32 million pixels in the source preview area; crop larger photos first.

**Show original** compares with the image when the dialog opened. **Reset** clears the preview settings. **Cancel** or Escape leaves the drawing unchanged; **Apply** creates one Undo step. **Restore original image** is a separate action that restores the pre-perspective image in one Undo step. Preview lines, grids, and corner handles never appear in exports.

### Adjust image color and tone

Select one image and choose **Adjust** beside the crop controls. **Appearance** offers Color, Grayscale, or Black & white with a threshold slider. Adjust Exposure (in stops), Contrast, and Saturation in the live preview. Under **Color ranges**, choose Reds, Yellows, Greens, Cyans, Blues, or Magentas, then change that range's saturation or brightness. Each range retains its own settings within the dialog. Range brightness also changes those colors' gray tones; neutral colors stay neutral.

The preview shows the visible cropped portion by default, including shape crops and cutouts. **Show uncropped image** reveals the full image without changing its crop. **Show original colors** compares with the colors when the dialog opened, using the same preview crop. **Reset all** clears every adjustment and range. **Apply** processes the full-resolution image while preserving transparency, placement, rotation, and crop masks. Undo restores the previous image. Cancel or Escape closes the dialog without changing the drawing. Adjustments run locally in a browser worker and are included in SVG, PNG, and editable PNG exports. Each new adjustment session starts with neutral controls for the image's current pixels.

### Trace an image to editable paths

Select one image, then choose **Trace image** beside the crop and background removal controls. The modal compares the visible image with its vector preview. **Convert to paths** replaces the image in place; Undo restores it. Tracing runs locally in a browser worker, so adjusting settings or canceling does not upload the image or change the artwork.

**Solid silhouette** captures the whole visible subject, including light colors and white eyes. Transparent images use their alpha shape; opaque images use the dominant plain background connected to the image border. **Background tolerance** adjusts that removal. Busy photo backgrounds need **Remove background** or Include/Exclude corrections first; the dialog warns when no reliable plain background exists. **Cutout outline** makes a hollow, filled vector band around the subject; **Outline width** is a percentage of the image's shorter side, independent of preview resolution. Both modes preserve real transparent cutouts and support touch-up brushes.

Use the preview **+** and **−** buttons, **Ctrl/Cmd+scroll**, or pinch to zoom both previews together, up to 800% of the fitted view. Choose **Pan preview** and drag either preview, hold **Space** while dragging, use the middle mouse button, or scroll to pan. **View only** also allows dragging when zoomed in. On touchscreens, drag with two fingers to pan; adding the second finger discards any unfinished brush stroke or color sample. Both previews move together, and **Fit** restores the full image. Your brush choice stays selected while panning. Preview navigation does not change the artwork or output size.

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

For a flat illustration with 5–10 colors, start with **Colors**, enter the maximum number of colors you need (any whole number from **1 to 64**), and set smoothing around **70%**. The palette prefers stable color regions and consolidates rare near-identical edge shades instead of turning antialiasing into extra color bands. Edge cleanup also avoids assigning blended border pixels to unrelated palette colors. Small color flecks are replaced with their surrounding region rather than cut out as holes.

Lower smoothing to retain tiny angular details; **0%** keeps straight-line tracing. Higher Detail increases the sampling resolution and node budget; it is separate from edge smoothing. Original SVG artwork can also be opened directly with **Open SVG**, avoiding raster tracing entirely.

**Group colors by** controls how pixels are matched to the palette:

- **RGB** keeps the original color-distance behavior.
- **Hue** emphasizes the color family and reduces shading differences, while treating black/gray/white separately from chromatic colors. This helps keep dark red with red rather than brown, and shaded blue with blue.
- **Value** groups by HSV brightness. Different hues with similar brightness can merge.
- **Saturation** groups by color intensity. Different hues with similar saturation can merge.

Use **Sample colors from original** to tap the main paint colors on the original preview, including while zoomed. Samples become fixed **color anchors**; remaining palette slots are chosen automatically. Sample two brown shades to retain both, or use exactly as many colors as anchors to control the entire palette. Remove an anchor with its swatch button or choose **Clear anchors**. Sampling white turns off **Leave white empty** so the selected white can be traced. Transparent pixels stay empty. Anchors apply to the current image session and clear when the dialog closes; the color count and grouping preference persist. **Reset defaults** also clears anchors.

For shaded cartoon artwork, try **Hue**, roughly **7–8 colors**, and anchors for red, blue, white, black, yellow, skin, and the browns you want to retain. Turn off **Stack colors to hide seams** when the paths need separate boundaries. These are color-based controls: similarly colored objects can still share a palette color, and the tracer cannot infer every human-recognizable object boundary.

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

**Simplify…** overlays a pink preview and shows **Nodes: original → preview**. The slider has a separate live **Tolerance** value in document pixels; higher values allow more outline change and generally fewer nodes. Sharp corner positions and their incoming/outgoing directions stay intact; explicitly independent Corner nodes remain independent. Smooth spans, gentle bends on imported outlines, and redundant straight-line nodes can be reduced. If no reduction is possible at the current tolerance while preserving corners, the dialog says so. Check small details and holes before choosing **Apply**; **Cancel** keeps the original. Repair and simplification support Undo and editable SVG saving. Editing a combined outline clears its Break Apart history; Undo restores it.

## Everyday color palette

Fill and Stroke include **No fill / No stroke**, shown with a red slash on the color button. These remove paint rather than making it transparent, retaining the current color for later use. Choose a preset to restore an opaque color. The palette includes neutrals, common bright colors, greens and blues, browns, cream, and several skin tones; each swatch has a color name. Custom hex, HSL, and transparency controls remain available. New drawings start with blue fill and charcoal outlines.

## Stroke endcaps and line patterns

In **Fill and Outline**, choose **Flat**, **Round**, or **Square** endcaps, and **Solid**, **Dashed**, or **Dotted** lines. Endcaps affect open line ends and individual dashes. Dotted lines use round caps automatically. Preset dash and dot spacing follows stroke width; imported custom SVG dash patterns are preserved. These styles apply to selected artwork or the next shape, support Undo, and survive SVG saving/reopening.

## Fillets and chamfers

In **Nodes**, select a sharp corner between lines or Bézier curves, then choose **Fillet** (round). **Chamfer** (bevel) is available between straight segments. Enter a **Radius** or **Distance** in the selected page units (in, mm, px, or pt). Changing units converts the displayed amount without changing the corner. Press Enter or leave the amount field to apply a change, or adjust the slider for a live preview. The controls appear in the right-hand **Align** panel while using **Nodes**. Multiple selected corners can be treated together.

Other anchors and the remaining lines and curves keep their shape. Curved fillets find a circular arc tangent to both sides and split the original Béziers exactly at its contact points. The search stays within the nearer half of each adjoining segment. If a requested curved radius does not fit, the artwork stays unchanged and a message asks for a smaller radius. Straight-line treatments stop at half the shorter adjoining edge to prevent neighbouring treatments from overlapping. Select either generated tangent node to adjust that corner again; setting its amount to **0** returns to its original sharp geometry. Endpoints and already smooth nodes are excluded. Curved chamfers are not supported.

Corner settings support Undo, local recovery, copy/paste, and SVG save/reopen. SVGs contain ordinary paths plus editing metadata. Moving, rotating, and resizing the object preserve corner settings; changing its individual nodes, handles, or topology turns the path into ordinary editable geometry. Undo restores the settings.

Applying background removal automatically crops empty edges around the remaining pixels while preserving the subject’s size, position, rotation, and existing crop restrictions. The crop retains the full raster; Reset crop restores its bounds, and Undo restores both the removed pixels and previous crop. Fully transparent results keep the previous bounds because there is no visible subject to fit.

Background and trace settings are saved locally in this browser, including modes, color/detail controls, brush sizes, and preview preferences. Cancel keeps these preferences without changing the artwork. Each dialog has **Reset defaults**, which also saves the reset for future sessions. Image-specific selections, touch-up marks, and preview zoom start fresh for each image; resetting defaults preserves current selections and marks.

Background removal preview supports **+ / −** keys and buttons, **Ctrl/Cmd+scroll**, and **pinch** zoom. Choose **Pan preview** and drag, hold **Space** while dragging, use the middle mouse button, or scroll to pan. On touchscreens, drag with two fingers; adding the second finger discards an unfinished brush stroke. Turn off **Pan preview** to resume your chosen brush. **Fit preview** resets the view. Brush size stays constant on screen for finer image edits when zoomed in.

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

Select text and choose **Path → Text to Path** to replace it with editable vector outlines in the drawing. Font, wrapping, spacing, alignment, and transforms are retained. Use **Nodes** to reshape the lettering, or use it with other path actions. Underlined text becomes a group; **Ungroup** to edit its lettering and underline separately. Selected groups convert their text while keeping other artwork. **Undo** restores the editable text. Unknown imported fonts must first be changed to a font in Formatting; unavailable fonts leave the selection intact.

**Bold**, **Italic**, and **Underline** are toggle buttons in Formatting. They apply directly to selected text and set the style for the next text object. Bold is unavailable when a family has no bold weight. Italic uses a real face when the font provides one; otherwise a 12-degree slant works without another download and is preserved by outline export. Underlines also become vector geometry in simple-path exports.

**Letter spacing (pt)** adds space between glyphs; negative values tighten lettering. **Line spacing (×)** multiplies the text size, with 1.2× as the default. Edit those values and choose **Apply text**. Letter spacing participates in word wrapping, and line spacing determines the distance between baselines. All formatting is retained by undo, recovery, copy/paste, and editable SVG save/reopen. Formatted canvas text and outlined SVGs share the same glyph layout so transforms and spacing remain consistent.

In **Save SVG**, enable **Export selected objects only** to save just the current selection, including selected groups. Its SVG page fits the visible geometry and stroke bounds of those objects. Leave it unchecked for the whole drawing at the current artboard size. The option is disabled when nothing is selected and works with either editable SVG or simple-path export, download, and sharing.

Choose **File → Export PNG** to download the full page as a PNG with a transparent background. **Output size** shows the actual pixel width and height; changing either keeps the proportions linked. **Use page size** restores the default output dimensions. Artwork outside the page is clipped; editor controls and selection handles are excluded. Text is rendered with the drawing’s fonts. The PNG uses the current drawing name.

With one image selected, **Use image resolution** switches to selected-object export and sets the output to preserve the source pixel detail, including the visible crop and rotation. This works even when the image was shrunk to fit the page. Custom output dimensions also work for selected objects and editable PNGs; editable artwork keeps its document dimensions when reopened. PNG output supports up to 16,384 pixels per side and 32 million pixels total.

### Offset paths

Select one or more closed vector paths and choose **Path → Offset Path** in the top toolbar. Enter a distance in the current page units: positive expands outward, negative insets. Choose Round, Miter (limited sharp corners), or Square corners, then inspect the dashed preview and choose **Apply offset** or **Cancel**. **Keep original paths** adds the offset copies alongside the originals; otherwise they replace the selected paths. Holes shrink when the surrounding shape expands and grow when it insets. An inset that removes an entire selected path is rejected without changing artwork.

Offsets produce ordinary editable closed paths, with curves approximated by short straight segments. Original fill and outline styles are retained; reversible corner and boolean construction metadata is replaced by the new geometry. Undo, browser recovery, and SVG save/open preserve the result. Open paths, groups, text, and images must be converted to closed paths or ungrouped first where appropriate. Offset distance describes the path boundary, independent of outline thickness.

### Browser recovery and multiple tabs

One tab owns the browser recovery slot. Other tabs can edit and save SVG files, but their persistent recovery banner says local autosave is paused. Their drawing and filename cannot overwrite the owner's recovery copy. **Use this tab for recovery** asks for confirmation, saves that tab's drawing, and pauses the previous owner. Switching focus does not transfer ownership. Paused tabs never take over automatically when an owner closes; a newly opened tab can recover and own the saved drawing when no owner remains. Closing a tab with changes awaiting recovery, paused autosave, or failed recovery requests the browser's unsaved-changes warning.

Recovery coordination requires the Web Locks API (HTTPS or localhost). If coordination or local storage is unavailable, the banner asks the user to save SVG. Browser recovery remains a convenience rather than a permanent backup.

Choose **Path → Stroke to Path** to convert selected vector outlines into editable filled paths. The conversion preserves the visible stroke width, caps, joins, dash pattern, colors, and transforms. Shapes with a fill keep their fill and converted outline together as a group; use **Ungroup** to edit them separately. The result supports node editing, Undo, browser recovery, and SVG saving and reopening.
