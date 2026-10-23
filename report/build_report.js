// Builds EdgeFall_Edge_AI_Report.docx in the K. J. Somaiya report style.
// Usage: node build_report.js [pages.json]   (pages.json maps headings/captions to page numbers)
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Header, Footer,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, PageNumber, LevelFormat,
  TabStopType, LeaderType, ExternalHyperlink, HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom, TextWrappingType, PageBreak,
} = require("docx");

const A = (f) => path.join(__dirname, "assets", f);
const pagesPath = process.argv[2];
const PAGES = pagesPath && fs.existsSync(pagesPath) ? JSON.parse(fs.readFileSync(pagesPath, "utf8")) : {};
const comp = JSON.parse(fs.readFileSync(A("compression.json"), "utf8"));
const shipped = JSON.parse(fs.readFileSync(A("metrics.json"), "utf8"));

const FONT = "Times New Roman";
const MONO = "Courier New";
const CONTENT_W = 9026; // A4 with 1 inch side margins, DXA
const REPO = "https://github.com/altf4-games/EdgeFall";
const RELEASES = "https://github.com/altf4-games/EdgeFall/releases";
const RELEASE_TAG = "https://github.com/altf4-games/EdgeFall/releases/tag/v0.1.0";

// ---------- formatting helpers ----------
const f2 = (x) => x.toFixed(2);
const f3 = (x) => x.toFixed(3);
const f4 = (x) => x.toFixed(4);
const pct = (x) => (x * 100).toFixed(1) + "%";
const kb = (x) => x.toFixed(1);
const red = (a, b) => "-" + ((1 - a / b) * 100).toFixed(1) + "%";

// inline markup: `code`, *italic*
function runs(text, base = {}) {
  const out = [];
  const re = /(`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...base }));
    const tok = m[0];
    if (tok[0] === "`") out.push(new TextRun({ text: tok.slice(1, -1), font: MONO, size: (base.size || 22) - 2, ...{ ...base, font: MONO } }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: FONT, ...base, italics: true }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...base }));
  return out;
}

const P = (text, opts = {}) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 120, line: 276 },
    children: Array.isArray(text) ? text : runs(text),
    ...opts,
  });

const H1 = (text, key) => {
  H_ENTRIES.push({ level: 1, text, key });
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text, font: FONT })] });
};
const H2 = (text) => {
  H_ENTRIES.push({ level: 2, text });
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, font: FONT })] });
};
const H3 = (text) => {
  H_ENTRIES.push({ level: 3, text });
  return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, font: FONT })] });
};
const SUB = (text) =>
  new Paragraph({ keepNext: true, spacing: { before: 120, after: 60 }, children: [new TextRun({ text, font: FONT, italics: true, bold: true, size: 22 })] });

const NUMREFS = [];
function NUM(items) {
  const ref = "num" + NUMREFS.length;
  NUMREFS.push(ref);
  return items.map((t) =>
    new Paragraph({ numbering: { reference: ref, level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 276 }, children: runs(t) }));
}
const BUL = (items) =>
  items.map((t) =>
    new Paragraph({ numbering: { reference: "bullets", level: 0 }, alignment: AlignmentType.JUSTIFIED, spacing: { after: 80, line: 276 }, children: runs(t) }));

function CODE(lines) {
  return lines.map((l, i) =>
    new Paragraph({
      spacing: { after: i === lines.length - 1 ? 160 : 0, line: 240 },
      indent: { left: 200, right: 200 },
      shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
      border: {
        top: i === 0 ? { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB", space: 4 } : undefined,
        bottom: i === lines.length - 1 ? { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB", space: 4 } : undefined,
        left: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB", space: 4 },
        right: { style: BorderStyle.SINGLE, size: 4, color: "BBBBBB", space: 4 },
      },
      children: [new TextRun({ text: l, font: MONO, size: 18 })],
    }));
}

// ---------- figures and tables with numbering ----------
const FIG_ORDER = ["arch", "curves", "device", "compress", "cm", "roc", "score"];
const TAB_ORDER = ["device", "stack", "dataset", "split", "train", "prune", "matrix", "compress", "tradeoff", "thresholds"];
const FIG_CAPTIONS = {};
const TAB_CAPTIONS = {};
const figUsed = [], tabUsed = [];
const figNo = (k) => FIG_ORDER.indexOf(k) + 1;
const tabNo = (k) => TAB_ORDER.indexOf(k) + 1;

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function FIG(key, file, caption, widthFrac = 1) {
  figUsed.push(key);
  FIG_CAPTIONS[key] = caption;
  const { w, h } = pngSize(A(file));
  const wpx = Math.round(600 * widthFrac);
  const hpx = Math.round((wpx * h) / w);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 80 },
      children: [new ImageRun({ type: "png", data: fs.readFileSync(A(file)), transformation: { width: wpx, height: hpx },
        altText: { title: `Figure ${figNo(key)}`, description: caption, name: file } })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { after: 200 },
      children: [new TextRun({ text: `Figure ${figNo(key)}: ${caption}`, font: FONT, size: 20 })],
    }),
  ];
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: "999999" };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };

function TABLE(key, caption, header, rows, widths, opts = {}) {
  tabUsed.push(key);
  TAB_CAPTIONS[key] = caption;
  const total = widths.reduce((a, b) => a + b, 0);
  const mk = (text, w, isHead, bold, keep = true) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA }, borders,
      shading: isHead ? { type: ShadingType.CLEAR, fill: "D9D9D9" } : undefined,
      margins: { top: 50, bottom: 50, left: 90, right: 90 },
      children: String(text).split("\n").map((line) =>
        new Paragraph({ spacing: { after: 0 }, keepNext: keep, alignment: AlignmentType.LEFT,
          children: runs(line, { size: 19, bold: isHead || bold }) })),
    });
  const tr = [new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => mk(h, widths[i], true)) })];
  rows.forEach((r, ri) => tr.push(new TableRow({ cantSplit: true, children: r.map((c, i) => mk(c, widths[i], false, opts.boldFirst && i === 0, ri < rows.length - 1)) })));
  const out = [
    new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 160, after: 80 },
      children: [new TextRun({ text: `Table ${tabNo(key)}: ${caption}`, font: FONT, size: 20 })] }),
    new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: tr }),
  ];
  if (opts.note) out.push(new Paragraph({ spacing: { before: 60, after: 160 }, alignment: AlignmentType.JUSTIFIED, children: runs(opts.note, { size: 18 }) }));
  else out.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  return out;
}

const link = (text, url) =>
  new ExternalHyperlink({ link: url, children: [new TextRun({ text, font: FONT, color: "1155CC", underline: {} })] });

// ---------- table of contents helpers ----------
const H_ENTRIES = []; // filled while body is built
function tocLine(text, page, level, bold) {
  return new Paragraph({
    spacing: { after: level === 1 ? 50 : 20, before: level === 1 ? 70 : 0 },
    indent: { left: (level - 1) * 360 },
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W, leader: LeaderType.DOT }],
    children: [new TextRun({ text, font: FONT, size: 20, bold }), new TextRun({ text: "\t" + page, font: FONT, size: 20, bold })],
  });
}
const FRONT = (text) =>
  new Paragraph({ pageBreakBefore: true, spacing: { after: 200 }, children: [new TextRun({ text, font: FONT, bold: true, size: 28 })] });

// ---------- body ----------
const body = [];
const add = (...xs) => xs.forEach((x) => (Array.isArray(x) ? body.push(...x) : body.push(x)));

// 1 Introduction
add(H1("1. Introduction & problem statement"));
add(H2("1.1 Background"));
add(P("Falls are one of the most common ways older people get hurt, and how quickly someone finds out about a fall often matters as much as the fall itself. Commercial fall detectors exist, but most are pendants or wristbands that the person has to buy, charge and remember to wear. Almost everyone already carries a phone, and every modern phone has an accelerometer and a gyroscope, the same two sensors used in published fall-detection research."));
add(P("Machine learning can turn those two signals into a fall detector, but where the model runs matters. Sending raw motion data to a server needs a network connection, adds delay and means a stream of personal data leaves the phone. Edge AI keeps the model on the device. The price is that the model has to be small and cheap enough to run all day on a phone's CPU without draining the battery."));
add(H2("1.2 Motivation"));
add(P("We wanted a fall detector that works with no extra hardware, no account and no internet connection. Three things pushed us towards running it on the phone. The first is privacy: motion data can show when someone is home, asleep or walking, so it is better if it never leaves the device. The second is reliability: a phone in a lift or a basement may have no signal, and the alert should still fire. The third is cost, since a model that fits in about 11 KB can run continuously in the background, which a cloud round trip every 100 ms could not."));
add(P("The project also suits this course, because the model has to be shrunk and measured and not only trained. Size, speed and accuracy all matter at the same time."));
add(H2("1.3 Objectives"));
add(NUM([
  "Detect falls using only the phone's built-in accelerometer and gyroscope, with no wearable and no network.",
  "Train a compact 1D-CNN on the SisFall dataset and evaluate it on volunteers who are not in the training data.",
  "Apply model compression, structured pruning and quantization, and measure what each one saves and what it costs in accuracy.",
  "Deploy the model as TensorFlow Lite in an Android app that keeps monitoring in the background and alerts locally.",
  "Report accuracy, size and latency honestly, including where the results may not carry over to real use.",
]));

// 2 Hardware & environment
add(H1("2. Hardware & environment specifications"));
add(H2("2.1 Edge device specifications"));
add(P("EdgeFall needs no hardware beyond a phone. There is no board, wearable or external sensor, so there is no hardware setup to photograph or geotag for this report. The app was built and tested on a Nothing Phone (3a). Table " + tabNo("device") + " lists the parts of it that matter for this project."));
add(TABLE("device", "Edge device used for EdgeFall", ["Item", "Specification"], [
  ["Device", "Nothing Phone (3a)"],
  ["Processor", "Qualcomm Snapdragon 7s Gen 3 (4 nm), octa-core: 1 x 2.5 GHz, 3 x 2.4 GHz, 4 x 1.8 GHz [9]"],
  ["Memory", "8 GB or 12 GB RAM, depending on the variant [9]"],
  ["Operating system", "Android 15 with Nothing OS [9]"],
  ["Sensors used", "Accelerometer and gyroscope"],
  ["Other sensors", "Compass, light and proximity [10]. No barometer, which the project does not need"],
  ["Where the model runs", "CPU, through the LiteRT (TensorFlow Lite) runtime. No GPU or NPU delegate is configured"],
  ["Sensor rate", "Requested at the game interval, then read by a timer at a fixed 50 Hz"],
  ["Model file", "11,664 bytes, bundled in the APK as an asset"],
], [2400, 6626], { boldFirst: true }));
add(P("Training and all the measurements in Section 4 were done on a cloud Linux container with four vCPUs (Intel Xeon at 2.80 GHz), 15 GB of RAM and no GPU. The model is small enough that a GPU is not needed. This matters for the latency numbers later, because they come from that server CPU and not from the phone."));
add(H2("2.2 Software & framework stack"));
add(P("Table " + tabNo("stack") + " lists the software. The Python side does the data preparation, training, compression and evaluation. The Flutter side is only the way the model reaches a phone: it reads the sensors [7], runs the model and shows notifications, so we describe it briefly."));
add(TABLE("stack", "Software and framework stack", ["Layer", "Tool", "Version or note"], [
  ["Dataset", "SisFall, community mirror [11]", "4,505 recordings used"],
  ["Language", "Python", "3.13"],
  ["Numerics, metrics", "NumPy, scikit-learn", "NumPy 2.5.3, scikit-learn 1.9.1"],
  ["Training", "TensorFlow with Keras", "TensorFlow 2.21.0, Keras 3.15.1"],
  ["Plots", "Matplotlib", "3.11.2"],
  ["Export", "TensorFlow Lite converter", "Part of TensorFlow 2.21.0"],
  ["App framework", "Flutter (Dart)", "Dart SDK ^3.13.1"],
  ["Sensor access", "sensors_plus", "^6.1.1"],
  ["Background monitoring", "flutter_background_service", "^5.1.0"],
  ["Alerts", "flutter_local_notifications", "^18.0.1"],
  ["Inference", "flutter_litert (LiteRT bindings) [6]", "^3.8.0"],
], [2300, 3500, 3226], { boldFirst: true }));

// 3 Methodology
add(H1("3. Methodology & model optimization pipeline"));
add(P("The pipeline has two halves, shown in Figure " + figNo("arch") + ". Data preparation turns raw SisFall files into normalized windows, and a small 1D-CNN turns each window into a fall probability. Everything after that (pruning, quantization and conversion) is about making the trained network cheaper to run."));
add(FIG("arch", "architecture.png", "Preprocessing pipeline and 1D-CNN architecture"));
add(H2("3.1 Baseline model selection"));
add(SUB("Dataset"));
add(P("We used SisFall [1]. It has recordings from 38 volunteers: 23 young adults (IDs starting with SA, aged 19 to 30) and 15 elderly people (SE, aged 60 to 75). Each volunteer performed 19 kinds of everyday movement, called ADLs (activities of daily living), such as walking, jogging, climbing stairs, sitting down and getting into a car. The young adults also performed 15 kinds of fall, among them slips, trips and fainting while walking, and falls while sitting down or getting up. The only elderly volunteer who simulated falls was SE06. The sensors were a waist-mounted ADXL345 accelerometer and an ITG3200 gyroscope sampled at 200 Hz. The dataset also has a second accelerometer (MMA8451Q) that we ignored, because its +-8 g range clips during hard impacts. The original host is offline, so we used a community mirror [11], which has 4,505 recording files."));
add(TABLE("dataset", "SisFall as used in this project", ["Item", "Value"], [
  ["Volunteers", "38 (23 young adults, 15 elderly)"],
  ["Recording files", "4,505 (2,707 ADL, 1,798 fall)"],
  ["Activity types", "19 ADL (D01 to D19) and 15 fall (F01 to F15)"],
  ["Raw format", "Nine columns of integer ADC counts at 200 Hz, no header row"],
  ["Columns used", "ADXL345 accelerometer (X, Y, Z) and ITG3200 gyroscope (X, Y, Z)"],
  ["Windows produced", "27,708 (1,798 fall and 25,910 ADL)"],
], [2400, 6626], { boldFirst: true }));
add(SUB("Preprocessing"));
add(P("Each recording goes through the same steps, in this order (prepare_dataset.py):"));
add(NUM([
  "Convert raw counts to physical units: the accelerometer to m/s2 and the gyroscope to rad/s, using each sensor's range and resolution.",
  "Take the magnitude of each three-axis signal. A phone in a pocket can be in any orientation, and magnitude does not depend on orientation, whereas separate X, Y and Z values would.",
  "Downsample from 200 Hz to 50 Hz by keeping every fourth sample. This matches the rate at which the app reads the phone's sensors.",
  "Compute jerk, the rate of change of acceleration magnitude, as a third channel. A fall has a sharp jump in acceleration at impact, and jerk makes that jump easy to see.",
  "Cut 2-second windows of 100 samples. Each fall recording gives one window centred on its peak acceleration, which is the impact. Each ADL recording is cut into back-to-back windows with no overlap.",
  "Divide each channel by a fixed constant ([30, 10, 500] for acceleration, rotation and jerk) so that all three sit on a similar scale.",
]));
add(P("We used fixed constants and not the dataset's mean and standard deviation, because SisFall's belt-mounted sensor and a phone in a pocket see different signals. The constants are rough upper limits that we chose by hand: about 3 g of acceleration, about 570 degrees per second of rotation, and roughly the 99th percentile of jerk in the data. We did not tune them. The same numbers are in the Dart code, because the model only works if the phone scales its input exactly as training did."));
add(SUB("Splitting the data"));
add(P("We split by volunteer and not by window. If windows from the same person end up in both the training and test sets, the model can learn that person's movement style and the test score looks better than it should. With a subject-wise split the test set only holds people the model has never seen. A seeded shuffle (seed 42) gave the split in Table " + tabNo("split") + "."));
add(TABLE("split", "Subject-wise split of the 27,708 windows", ["Set", "Volunteers", "Windows", "Fall windows"], [
  ["Train", "28", "20,817", "1,423"],
  ["Validation", "5", "3,280", "150"],
  ["Test", "5 (SA05, SA06, SA23, SE05, SE07)", "3,611", "225"],
], [1500, 3826, 1800, 1900], {
  boldFirst: true,
  note: "SE05 and SE07 are elderly volunteers who only performed ADLs, so all 225 test falls come from three young adults (SA05, SA06 and SA23: 15 fall types x 5 trials each).",
}));
add(SUB("Why a 1D-CNN"));
add(P("A fall is a short pattern in a time series: acceleration drops towards zero while falling, spikes on impact, and then the body is still. A 1D convolution slides small filters along the time axis and learns to spot patterns like that wherever they occur in the window. The three channels play the role that red, green and blue play in an image. We picked a CNN over a recurrent network because it is smaller, processes all time steps at once and quantizes well. We did not train a recurrent model, so we cannot say how it would compare. We picked a learned model over a hand-written threshold rule (the first version of the app, still in the repository as fall_detector.dart) because a learned model can use the whole window of data and not only a few trigger conditions."));
add(P("The network has two convolution layers with 16 and 32 filters of width 5, so each filter looks at 0.1 s of signal. A max-pooling layer between them halves the time axis. Global average pooling then collapses the time axis into 32 numbers, one per learned pattern, and a small dense layer with dropout turns those into one probability between 0 and 1. In total there are 3,393 parameters."));
add(SUB("Training"));
add(P("We trained with the Adam optimizer [4] and the settings in Table " + tabNo("train") + ". Falls are only 6.5% of the windows, so a model that always answered \"no fall\" would be right 93.5% of the time. The class weight makes a missed fall cost about 14 times more than a false alarm during training. We stopped on validation recall because a missed fall is the worse mistake."));
add(TABLE("train", "Training configuration", ["Setting", "Value"], [
  ["Optimizer", "Adam, learning rate 0.001"],
  ["Loss", "Binary cross-entropy"],
  ["Class weights", "ADL 1.0, fall 13.6 (negatives divided by positives in the training set)"],
  ["Batch size", "64"],
  ["Maximum epochs", "50"],
  ["Early stopping", "Monitor validation recall, patience 8, restore best weights"],
  ["Dropout", "0.3"],
  ["Random seed", "42"],
  ["Training hardware", "CPU only"],
], [2400, 6626], { boldFirst: true }));
add(P("We trained the network twice with the same code. The first run produced the model that ships in the app, and its training history was not saved. For this report we ran training again with a fixed random seed and saved the history. We use that second run for the compression experiments and for the curves in Figure " + figNo("curves") + ". Early stopping ended the second run after 13 epochs and restored the weights from epoch 5, which had the best validation recall. The validation loss is lower than the training loss because the training loss includes the class weights and the validation loss does not."));
add(FIG("curves", "training_curves.png", "Loss, precision and recall per epoch from the seeded re-run (best epoch 5 of 13)"));

add(H2("3.2 Model compression techniques"));
add(P("The baseline is already small, at 3,393 parameters. Compression here is less about making a huge model fit and more about seeing how much further a small one can shrink and what each step costs. We tried two techniques, structured pruning and post-training quantization. All numbers in this section and in Section 4 come from compression_experiments.py, which starts from the seeded re-run's float32 model and is evaluated on the same 3,611 test windows."));
add(H3("3.2.1 Structured pruning"));
add(P("Pruning removes the parts of a network that contribute little. Unstructured pruning zeroes individual weights, which leaves every layer the same shape and gives no speed-up on ordinary hardware unless special sparse kernels exist. Structured pruning removes whole filters, so the layers really get smaller. We used the L1-norm method of Li et al. [2]: rank each filter by the sum of the absolute values of its weights, and drop the filters with the smallest sums."));
add(P("We kept half of the filters in each convolution layer: 8 of 16 in the first and 16 of 32 in the second. Removing a filter from the first layer also removes the matching input channel of the second layer, and removing one from the second layer removes the matching input row of the dense layer, so we sliced those weights as well. Then we fine-tuned the smaller network with the same recipe as before (class weights and early stopping on validation recall)."));
add(TABLE("prune", "Effect of pruning half of the filters in each convolution layer", ["Layer", "Original (parameters)", "Pruned (parameters)"], [
  ["Conv1D, first", "16 filters (256)", "8 filters (128)"],
  ["Conv1D, second", "32 filters (2,592)", "16 filters (656)"],
  ["Dense 16", "32 inputs (528)", "16 inputs (272)"],
  ["Output", "16 inputs (17)", "16 inputs (17)"],
  ["Total", "3,393", "1,073 (" + red(comp.pruned_fp32.params, comp.keras_fp32.params) + ")"],
], [2600, 3213, 3213], { boldFirst: true }));
add(P("Right after pruning, before any fine-tuning, the model still ranked windows reasonably well (ROC AUC " + f3(comp.pruned_before_finetune.roc_auc) + " against " + f3(comp.keras_fp32.roc_auc) + "), but its scores shifted: at the 0.9 threshold precision fell to " + f2(comp.pruned_before_finetune.precision) + " while recall stayed at " + f2(comp.pruned_before_finetune.recall) + ". Fine-tuning fixed that. The fine-tuned pruned model scored precision " + f2(comp.pruned_fp32.precision) + ", recall " + f2(comp.pruned_fp32.recall) + " and F1 " + f3(comp.pruned_fp32.f1) + " at the same threshold, against " + f2(comp.keras_fp32.precision) + ", " + f2(comp.keras_fp32.recall) + " and " + f3(comp.keras_fp32.f1) + " for the unpruned model (Table " + tabNo("tradeoff") + "). We would not read the small gain as pruning improving the model. The test set has only 225 falls and this is a single run, so differences of a point or two are within noise. What we can say is that half the filters were not needed for this task. We did not put the pruned model in the app, which still uses the unpruned quantized model."));
add(H3("3.2.2 Quantization technique"));
add(P("Quantization stores numbers with fewer bits. We used post-training dynamic-range quantization [3][5]. After training, the converter stores the weights as 8-bit integers and converts them back to float while computing, and the activations stay in floating point. It needs no calibration data and no retraining, and it is one line in the converter:"));
add(CODE([
  "converter = tf.lite.TFLiteConverter.from_keras_model(model)",
  "converter.optimizations = [tf.lite.Optimize.DEFAULT]",
  "tflite_model = converter.convert()",
]));
add(P("The file shrank from " + kb(comp.tflite_fp32.size_kb) + " KB to " + kb(comp.tflite_dynamic.size_kb) + " KB, a " + red(comp.tflite_dynamic.size_kb, comp.tflite_fp32.size_kb).replace("-", "") + " reduction, and the outputs barely moved. At the 0.9 threshold precision, recall and F1 were identical to the float32 TFLite model, and ROC AUC differed only in the fifth decimal place (" + comp.tflite_fp32.roc_auc.toFixed(5) + " against " + comp.tflite_dynamic.roc_auc.toFixed(5) + "). The saving is smaller than the 4x that 8-bit weights suggest. As far as we can tell, the converter leaves weight tensors with fewer than 1,024 elements in float, because the saving is too small to justify the conversion work. In this network only the second convolution layer (5 x 16 x 32 = 2,560 weights) is large enough. The pruned model supports this reading: none of its tensors reaches 1,024 elements, and its quantized and float files are exactly the same size (" + kb(comp.pruned_fp32.size_kb) + " KB)."));
add(H2("3.3 Compilation & execution engine"));
add(P("There is no compilation step that produces machine code. The converter turns the Keras graph into a TensorFlow Lite flatbuffer (fall_model.tflite) and the app runs it with an interpreter. The file is declared as a Flutter asset and goes into the APK. At start-up the app loads it with `Interpreter.fromAsset` from flutter_litert, a binding to the LiteRT (TensorFlow Lite) runtime [6]. The input tensor is 1 x 100 x 3 floats and the output is one float. The app does not configure a GPU or NNAPI delegate, so inference runs on the CPU with the library's defaults. For a model this small that is enough."));
add(P("Figure " + figNo("device") + " shows what happens on the phone. A foreground service keeps monitoring running when the app is closed. Every 20 ms a timer reads the latest accelerometer and gyroscope values, computes magnitudes and jerk, scales them with the same constants as training and pushes the sample into a buffer of the last 100. Once the buffer is full, the app runs the model on every fifth new sample, which is about every 100 ms. An alert needs the probability to be above 0.95 on two consecutive windows. After an alert the detector stays silent for 10 seconds, so a single fall, which spans many overlapping windows, does not raise a string of notifications. The alert is a local notification and nothing is sent anywhere."));
add(FIG("device", "device_pipeline.png", "Inference flow on the phone"));

// 4 Performance
add(H1("4. Performance & comparison analysis"));
add(P("All results use the same test set: 3,611 windows from five volunteers who were never used for training or for deciding when to stop (225 fall windows and 3,386 ADL windows). Two trained models appear in this section and we keep them apart on purpose. The *shipped* model is the file in the app (11,664 bytes). The *re-run* model is the seeded retraining that we compressed and timed. With the same code and the same split, the re-run scores higher than the shipped model (F1 " + f2(comp.keras_fp32.f1) + " against " + f2(shipped.thresholds["0.9"].f1) + " at the 0.9 threshold). We take that as a sign that results vary from one training run to the next. We did not measure that spread over several seeds, and the shipped model's numbers should not be read next to the re-run's as if they came from one model."));
add(H2("4.1 Baseline AI vs. Edge AI comparative matrix"));
add(P("The baseline is the float32 Keras model running in Python on a server CPU, which is how the model would be used with no edge optimization. The edge version is the quantized TFLite model that runs inside the app. Both come from the re-run, so the differences in Table " + tabNo("matrix") + " come from the file format and the runtime and not from training."));
add(TABLE("matrix", "Baseline AI compared with Edge AI (re-run model, threshold 0.9)", ["Metric", "Baseline AI: Keras float32", "Edge AI: TFLite, dynamic-range quantized"], [
  ["Runtime", "Python with TensorFlow", "LiteRT interpreter inside the Android app"],
  ["Model file", kb(comp.keras_fp32.size_kb) + " KB (.keras)", kb(comp.tflite_dynamic.size_kb) + " KB (.tflite)"],
  ["Parameters", "3,393", "3,393"],
  ["Weight storage", "32-bit float", "8-bit integer in the largest layer, float elsewhere"],
  ["Precision", f3(comp.keras_fp32.precision), f3(comp.tflite_dynamic.precision)],
  ["Recall", f3(comp.keras_fp32.recall), f3(comp.tflite_dynamic.recall)],
  ["F1", f3(comp.keras_fp32.f1), f3(comp.tflite_dynamic.f1)],
  ["ROC AUC", f4(comp.keras_fp32.roc_auc), f4(comp.tflite_dynamic.roc_auc)],
  ["Median latency per window*", comp.keras_fp32.latency_ms.toFixed(3) + " ms", comp.tflite_dynamic.latency_ms.toFixed(4) + " ms"],
  ["Can run inside a phone app", "No, needs Python and TensorFlow", "Yes"],
], [2700, 3100, 3226], {
  boldFirst: true,
  note: "*Median of 2,000 single-window runs on one CPU thread of the server described in Section 2.1. The Keras figure includes Python and TensorFlow call overhead, so the gap overstates how much faster the TFLite arithmetic is. The .keras file also stores the optimizer state and the model configuration, so its size is not a pure weight count. These are not measurements from the phone.",
}));
add(P("At the threshold we use, accuracy is identical across the two formats, so quantization has no visible accuracy cost on this task. The practical gain is that the edge model is a single " + kb(comp.tflite_dynamic.size_kb) + " KB file that a phone can load with no Python runtime."));
add(H2("4.2 Compression & memory reduction metrics"));
const k = comp.keras_fp32.size_kb, t32 = comp.tflite_fp32.size_kb;
add(TABLE("compress", "Model size after each compression step (re-run model)", ["Variant", "Parameters", "File size (KB)", "vs. Keras file", "vs. TFLite float32"], [
  ["Keras float32", "3,393", kb(k), "baseline", "n/a"],
  ["TFLite float32", "3,393", kb(t32), red(t32, k), "baseline"],
  ["TFLite dynamic-range int8", "3,393", kb(comp.tflite_dynamic.size_kb), red(comp.tflite_dynamic.size_kb, k), red(comp.tflite_dynamic.size_kb, t32)],
  ["Pruned, float32", "1,073", kb(comp.pruned_fp32.size_kb), red(comp.pruned_fp32.size_kb, k), red(comp.pruned_fp32.size_kb, t32)],
  ["Pruned, dynamic-range int8", "1,073", kb(comp.pruned_dynamic.size_kb), red(comp.pruned_dynamic.size_kb, k), red(comp.pruned_dynamic.size_kb, t32)],
], [2700, 1300, 1600, 1600, 1826], { boldFirst: true }));
add(P("Converting from the Keras file to a TFLite float32 file is the biggest single drop (" + red(t32, k).replace("-", "") + "), mostly because the .keras file carries training state. After that, quantization takes another " + red(comp.tflite_dynamic.size_kb, t32).replace("-", "") + " off and pruning takes " + red(comp.pruned_fp32.size_kb, t32).replace("-", "") + " off. Pruning and quantization do not stack here, because of the 1,024-element rule from Section 3.2.2. The shipped model (11,664 bytes) is the quantized, unpruned variant. Runtime memory is mostly the 100 x 3 input buffer and the interpreter's own allocations, which we did not measure."));
add(FIG("compress", "compression.png", "Size, latency and F1 for each variant (re-run model)"));
add(H2("4.3 Latency & accuracy trade-offs"));
add(TABLE("tradeoff", "Accuracy and latency of each variant at threshold 0.9 (re-run model)", ["Variant", "Precision", "Recall", "F1", "ROC AUC", "Latency (ms)"], [
  ["Keras float32", f3(comp.keras_fp32.precision), f3(comp.keras_fp32.recall), f3(comp.keras_fp32.f1), f4(comp.keras_fp32.roc_auc), comp.keras_fp32.latency_ms.toFixed(3)],
  ["TFLite float32", f3(comp.tflite_fp32.precision), f3(comp.tflite_fp32.recall), f3(comp.tflite_fp32.f1), f4(comp.tflite_fp32.roc_auc), comp.tflite_fp32.latency_ms.toFixed(4)],
  ["TFLite dynamic int8", f3(comp.tflite_dynamic.precision), f3(comp.tflite_dynamic.recall), f3(comp.tflite_dynamic.f1), f4(comp.tflite_dynamic.roc_auc), comp.tflite_dynamic.latency_ms.toFixed(4)],
  ["Pruned, before fine-tuning", f3(comp.pruned_before_finetune.precision), f3(comp.pruned_before_finetune.recall), f3(comp.pruned_before_finetune.f1), f4(comp.pruned_before_finetune.roc_auc), "n/a"],
  ["Pruned, float32", f3(comp.pruned_fp32.precision), f3(comp.pruned_fp32.recall), f3(comp.pruned_fp32.f1), f4(comp.pruned_fp32.roc_auc), comp.pruned_fp32.latency_ms.toFixed(4)],
  ["Pruned, dynamic int8", f3(comp.pruned_dynamic.precision), f3(comp.pruned_dynamic.recall), f3(comp.pruned_dynamic.f1), f4(comp.pruned_dynamic.roc_auc), comp.pruned_dynamic.latency_ms.toFixed(4)],
], [2500, 1200, 1100, 1000, 1200, 2026], { boldFirst: true }));
add(P("Every TFLite variant ran one window in under 0.01 ms on the server CPU, which is 6 to 9 microseconds. The differences among them are inside measurement noise: the pruned quantized model came out slower than the pruned float one even though the two are the same file size and structure. The app asks for an inference every 100 ms, so even a phone a hundred times slower than this server would spend a small fraction of its time on the model. We have not measured on the phone, and we expect the sensor timer, notifications and the foreground service to cost more battery than the model does, but we have not measured that either. A proper measurement on the Nothing Phone (3a) is the first item in Section 5.2."));
add(P("Accuracy depends much more on the decision threshold than on compression. Table " + tabNo("thresholds") + " shows the shipped model at three thresholds, and Figure " + figNo("cm") + " shows the same results as percentages of each true class."));
const th = shipped.thresholds;
const row = (t) => [t, f3(th[t].precision), f3(th[t].recall), f3(th[t].specificity), f3(th[t].f1), `${th[t].tp} / ${th[t].fp} / ${th[t].fn} / ${th[t].tn}`];
add(TABLE("thresholds", "Shipped model on the 3,611 test windows at three thresholds", ["Threshold", "Precision", "Recall", "Specificity", "F1", "TP / FP / FN / TN"], [
  row("0.5"), row("0.9"), ["0.95 (app)"].concat(row("0.95").slice(1)),
], [1500, 1200, 1100, 1300, 1000, 2926], {
  boldFirst: true,
  note: "ROC AUC " + f3(shipped.roc_auc) + ", average precision " + f3(shipped.average_precision) + ". Falls are 6.2% of the test windows (225 of 3,611).",
}));
add(FIG("cm", "confusion_matrices_normalized.png", "Row-normalized confusion matrices of the shipped model"));
add(P("The threshold moves the model along one curve. At 0.5 it finds " + pct(th["0.5"].recall) + " of falls but flags " + pct(1 - th["0.5"].specificity) + " of ordinary windows. At 0.95, which the app uses, it flags only " + pct(1 - th["0.95"].specificity) + " of ordinary windows but misses " + pct(1 - th["0.95"].recall) + " of falls. We raised the app's threshold from 0.9 to 0.95 after trying it on the phone, because dropping the phone onto a soft surface set off alerts. The ROC curve in Figure " + figNo("roc") + " shows that the model separates the two classes well (AUC " + f3(shipped.roc_auc) + "). The precision-recall curve explains why precision stays modest: only about 6% of test windows are falls, so even a " + pct(1 - th["0.95"].specificity) + " false-positive rate gives about two false alarms for every three real detections (" + th["0.95"].fp + " against " + th["0.95"].tp + ")."));
add(FIG("roc", "roc_pr_curves.png", "ROC and precision-recall curves of the shipped model, with the three thresholds marked"));
add(P("Figure " + figNo("score") + " shows where the errors sit. Most ADL windows get a probability close to zero and most fall windows get one close to one, but the two overlap above 0.9, which is why the last few points of threshold trade so much recall for so little precision."));
add(FIG("score", "score_distribution.png", "Distribution of the shipped model's output on the test set (log scale)", 0.75));
add(P("The two-consecutive-windows rule should lower false alarms further, because windows overlap heavily and a short spike is unlikely to repeat. We have not measured it. All the numbers above are per window on SisFall's trimmed clips, and an hour of a phone sitting in a pocket may look different. That is the biggest gap between these results and real use."));
add(P("Four more things limit how far these results can be trusted. SisFall's falls were performed onto a mattress by volunteers wearing a belt sensor, whereas the app runs on a phone in a pocket or hand, so the signal differs, and a bare phone dropped on a bed or sofa can look like a cushioned fall. Elderly volunteers contributed no falls except SE06, who is not in the test set, so there is no result for real elderly falls. Each fall window is centred on the impact while ADL windows are cut without regard to their content, which makes the test easier than continuous monitoring. Finally, the compressed models were each trained once, and timed on a server CPU."));

// 5 Conclusion
add(H1("5. Conclusion & future scope"));
add(H2("5.1 Summary of results"));
add(P("EdgeFall runs a 3,393-parameter 1D-CNN on a phone's accelerometer and gyroscope and raises a local notification when it sees a fall. The model in the app is 11,664 bytes. On five volunteers it never saw in training, it detects " + pct(th["0.9"].recall) + " of fall windows at " + pct(th["0.9"].precision) + " precision with a 0.9 threshold, and " + pct(th["0.95"].recall) + " at " + pct(th["0.95"].precision) + " with the 0.95 threshold the app uses. ROC AUC is " + f3(shipped.roc_auc) + "."));
add(P("In the compression experiments, quantization cut the TFLite file by " + red(comp.tflite_dynamic.size_kb, t32).replace("-", "") + " with no change in accuracy. Structured pruning removed " + red(comp.pruned_fp32.params, comp.keras_fp32.params).replace("-", "") + " of the parameters and " + red(comp.pruned_fp32.size_kb, t32).replace("-", "") + " of the file size and, after fine-tuning, kept the F1 score (" + f3(comp.pruned_fp32.f1) + " against " + f3(comp.keras_fp32.f1) + "). The two did not add up, because the pruned layers are too small for the converter to quantize. The main weakness is false alarms from soft-surface drops, which follows from SisFall's padded falls and belt-worn sensor."));
add(H2("5.2 Future improvements"));
add(NUM([
  "Measure latency, memory and battery use on the Nothing Phone (3a) and not on a server CPU.",
  "Record a few hundred windows of a phone dropped on beds, sofas, tables and floors, and fine-tune on them as hard negatives. This goes straight at the main false-alarm source.",
  "Evaluate on long continuous recordings, with falls hidden inside hours of ordinary movement, and report false alarms per hour for the full decision rule.",
  "Train with several random seeds and report the spread before deciding which model to ship, since the re-run in this report scored higher than the shipped one.",
  "Ship the pruned model if it holds up across seeds, and try quantization-aware training or full integer quantization if we move to hardware that needs it.",
]));
add(H2("5.3 GitHub link"));
add(P([new TextRun({ text: "Source code, training scripts, results and this report's experiment scripts: ", font: FONT }), link(REPO, REPO)], { alignment: AlignmentType.LEFT }));
add(P([new TextRun({ text: "Download the Android app (APK) from the Releases section: ", font: FONT }), link(RELEASES, RELEASES), new TextRun({ text: " (release v0.1.0: ", font: FONT }), link(RELEASE_TAG, RELEASE_TAG), new TextRun({ text: ")", font: FONT })], { alignment: AlignmentType.LEFT }));
add(H2("5.4 Google Drive link with code"));
add(P([new TextRun({ text: "Google Drive link: ", font: FONT }), new TextRun({ text: "[paste the share link here]", font: FONT, highlight: "yellow" })], { alignment: AlignmentType.LEFT }));

// References
const REFS = [
  "[1] A. Sucerquia, J. D. López and J. F. Vargas-Bonilla, \"SisFall: A Fall and Movement Dataset,\" Sensors, vol. 17, no. 1, article 198, 2017.",
  "[2] H. Li, A. Kadav, I. Durdanovic, H. Samet and H. P. Graf, \"Pruning Filters for Efficient ConvNets,\" in Proc. International Conference on Learning Representations (ICLR), 2017.",
  "[3] B. Jacob et al., \"Quantization and Training of Neural Networks for Efficient Integer-Arithmetic-Only Inference,\" in Proc. IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR), 2018.",
  "[4] D. P. Kingma and J. Ba, \"Adam: A Method for Stochastic Optimization,\" in Proc. International Conference on Learning Representations (ICLR), 2015.",
  "[5] Google AI Edge, \"Post-training quantization,\" LiteRT documentation, https://ai.google.dev/edge/litert/models/post_training_quantization.",
  "[6] flutter_litert package, https://pub.dev/packages/flutter_litert.",
  "[7] sensors_plus package, https://pub.dev/packages/sensors_plus.",
  "[8] P. Mistry, R. Kokate, A. Raut and S. Gupta, \"EdgeFall,\" " + REPO + ".",
  "[9] GSMArena, \"Nothing Phone (3a),\" https://m.gsmarena.com/nothing_phone_(3a)-ampp-13672.php.",
  "[10] 91mobiles, \"Nothing Phone 3a specifications,\" https://www.91mobiles.com/nothing-phone-3a-price-in-india?ty=specs.",
  "[11] BIng2325, \"SisFall,\" community mirror of the dataset (GitHub repository), https://github.com/BIng2325/SisFall.",
];
add(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: "References", font: FONT })] }));
H_ENTRIES.push({ level: 1, text: "References" });
REFS.forEach((r) => body.push(new Paragraph({ spacing: { after: 100 }, indent: { left: 500, hanging: 500 }, alignment: AlignmentType.LEFT, children: runs(r, { size: 21 }) })));

// sanity: order of figures/tables used must match the predefined order
if (JSON.stringify(figUsed) !== JSON.stringify(FIG_ORDER)) throw new Error("Figure order mismatch: " + figUsed);
if (JSON.stringify(tabUsed) !== JSON.stringify(TAB_ORDER)) throw new Error("Table order mismatch: " + tabUsed);

// ---------- front matter ----------
const front = [];
const rule = { style: BorderStyle.SINGLE, size: 8, color: "000000", space: 8 };
const C = (text, o = {}) => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: o.after ?? 60, before: o.before ?? 0 }, border: o.border,
  children: [new TextRun({ text, font: FONT, size: o.size ?? 24, bold: o.bold, italics: o.italics, color: o.color })] });
front.push(C("", { before: 2400 }));
front.push(C("EdgeFall", { size: 64, bold: true, after: 160 }));
front.push(C("On-Device Fall Detection from Phone Accelerometer and Gyroscope Data Using a Compressed 1D-CNN", { size: 26, italics: true, after: 500 }));
front.push(new Paragraph({ border: { top: rule }, spacing: { after: 0 }, children: [] }));
front.push(C("Edge AI Lab CA Mini Project Report", { size: 28, bold: true, before: 100, after: 100 }));
front.push(new Paragraph({ border: { bottom: rule }, spacing: { after: 500 }, children: [] }));
front.push(C("Submitted by", { size: 20, color: "444444", after: 100 }));
for (const n of ["Pradyum Mistry", "Rayan Kokate", "Aryan Raut", "Satvik Gupta"]) front.push(C(n, { size: 26, bold: true, after: 40 }));
front.push(C("", { after: 40 }));
front.push(C("B.Tech Computer Engineering, Last Year"));
front.push(C("K. J. Somaiya School of Engineering, Mumbai", { after: 360 }));
front.push(C("Edge AI (Lab CA Mini Project), Semester VII, 2026-2027", { after: 20 }));
front.push(C("October 2026", { after: 360 }));
front.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Code: ", font: FONT, size: 20, color: "555555" }), link("github.com/altf4-games/EdgeFall", REPO)] }));
front.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Download (Releases): ", font: FONT, size: 20, color: "555555" }), link("github.com/altf4-games/EdgeFall/releases", RELEASES)] }));

front.push(FRONT("Abstract"));
front.push(P("EdgeFall detects falls using only the accelerometer and gyroscope already inside a phone. The motion data never leaves the device. A small 1D convolutional network with 3,393 parameters looks at the last two seconds of movement every 100 ms and decides whether it resembles a fall."));
front.push(P("We trained the network on SisFall, a public dataset of falls and everyday movements recorded from 38 volunteers [1]. Each recording is converted to physical units, reduced to acceleration magnitude, rotation magnitude and jerk, downsampled from 200 Hz to 50 Hz and cut into 2-second windows. After post-training quantization the model is 11,664 bytes (11.4 KB). On five volunteers who were held out of training, the model in the app catches " + Math.round(th["0.9"].recall * 100) + "% of fall windows at " + Math.round(th["0.9"].precision * 100) + "% precision with a 0.9 threshold. The app itself uses a stricter 0.95 threshold and needs two positive windows in a row, which gives " + Math.round(th["0.95"].recall * 100) + "% recall and " + Math.round(th["0.95"].precision * 100) + "% precision per window."));
front.push(P("For the compression part of the course we ran a separate, seeded training run and compared it with its own float32 baseline. Quantization cut the TFLite file from " + kb(t32) + " KB to " + kb(comp.tflite_dynamic.size_kb) + " KB with no change in precision or recall. Structured pruning, which removed half the filters in each convolution layer, cut the parameters by " + Math.round((1 - comp.pruned_fp32.params / comp.keras_fp32.params) * 100) + "% and, after fine-tuning, scored about the same F1 as the unpruned model (" + f2(comp.pruned_fp32.f1) + " against " + f2(comp.keras_fp32.f1) + "). The main limits are that SisFall's falls were performed onto a mattress by people wearing a belt sensor, so a bare phone dropped on a bed can trigger a false alarm, and that we measured latency on a server CPU and not on the phone."));
front.push(new Paragraph({ spacing: { before: 120 }, alignment: AlignmentType.JUSTIFIED, children: [
  new TextRun({ text: "Keywords: ", font: FONT, bold: true }),
  new TextRun({ text: "edge AI, fall detection, 1D-CNN, SisFall, TensorFlow Lite, quantization, structured pruning, on-device inference.", font: FONT, italics: true })] }));

// TOC pages
function pageOf(key) { return PAGES[key] !== undefined ? String(PAGES[key]) : "0"; }
front.push(FRONT("Table of contents"));
H_ENTRIES.forEach((e) => front.push(tocLine(e.text, pageOf("H|" + e.text), e.level, e.level === 1)));
front.push(FRONT("List of figures"));
FIG_ORDER.forEach((k) => front.push(tocLine(`Figure ${figNo(k)}: ${FIG_CAPTIONS[k]}`, pageOf("F|" + k), 1, false)));
front.push(FRONT("List of tables"));
TAB_ORDER.forEach((k) => front.push(tocLine(`Table ${tabNo(k)}: ${TAB_CAPTIONS[k]}`, pageOf("T|" + k), 1, false)));

fs.writeFileSync(path.join(__dirname, "toc_keys.json"), JSON.stringify({
  headings: H_ENTRIES.map((e) => e.text),
  figures: FIG_ORDER.map((k) => ({ key: k, text: `Figure ${figNo(k)}: ${FIG_CAPTIONS[k]}` })),
  tables: TAB_ORDER.map((k) => ({ key: k, text: `Table ${tabNo(k)}: ${TAB_CAPTIONS[k]}` })),
}, null, 1));

// ---------- header / footer ----------
const IN = 914400;
const px = (inches) => Math.round(inches * 96);
function floatImg(file, wIn, hIn, xIn, yIn, behind) {
  return new ImageRun({
    type: "png", data: fs.readFileSync(A(file)), transformation: { width: px(wIn), height: px(hIn) },
    altText: { title: file, description: "Somaiya header graphic", name: file },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(xIn * IN) },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(yIn * IN) },
      behindDocument: behind, allowOverlap: true, lockAnchor: true,
      wrap: { type: TextWrappingType.NONE },
    },
  });
}
const mkHeader = () => new Header({ children: [new Paragraph({ children: [
  floatImg("redbar.png", 0.56, 10.5, 0, 1.12, true),
  floatImg("somaiya_logo.png", 2.25, 0.66, 0.38, 0.13, true),
  floatImg("trust_logo.png", 0.98, 0.75, 7.15, 0.13, true),
] })] });
const footerNum = new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: "555555" })] })] });
const footerEmpty = new Footer({ children: [new Paragraph({ children: [] })] });

const doc = new Document({
  creator: "Pradyum Mistry, Rayan Kokate, Aryan Raut, Satvik Gupta",
  title: "EdgeFall: On-Device Fall Detection (Edge AI Lab CA Mini Project Report)",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: FONT }, paragraph: { spacing: { before: 0, after: 200 }, outlineLevel: 0, keepNext: true } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 25, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1, keepNext: true } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 23, bold: true, font: FONT }, paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2, keepNext: true } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ...NUMREFS.map((ref) => ({ reference: ref, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] })),
    ],
  },
  sections: [{
    properties: {
      titlePage: true,
      page: { size: { width: 11906, height: 16838 }, margin: { top: 1800, bottom: 1300, left: 1440, right: 1440, header: 300, footer: 500 } },
    },
    headers: { default: mkHeader(), first: mkHeader() },
    footers: { default: footerNum, first: footerEmpty },
    children: [...front, ...body],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "EdgeFall_Edge_AI_Report.docx");
  fs.writeFileSync(out, buf);
  console.log("wrote", out);
});
