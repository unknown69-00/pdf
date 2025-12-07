// --- App Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // Config
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

    // DOM Elements
    const toolsGrid = document.getElementById('tools-grid');
    const modal = document.getElementById('tool-modal');
    const modalClose = document.getElementById('modal-close');
    const modalTitle = document.getElementById('modal-title');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const toolOptions = document.getElementById('tool-options');
    const processBtn = document.getElementById('process-btn');
    const loader = document.getElementById('process-loader');
    const loaderText = document.getElementById('loader-text');
    const processResult = document.getElementById('process-result');
    const header = document.getElementById('main-header');
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');

    // State
    let currentToolId = null;
    let currentFiles = [];

    // --- Tool Definitions ---
    const tools = {
        'merge-pdf': {
            title: 'Merge PDF',
            desc: 'Combine multiple PDFs into one unified document.',
            icon: 'merge_type',
            multiple: true,
            accept: '.pdf',
            process: async (files) => {
                const { PDFDocument } = PDFLib;
                const mergedPdf = await PDFDocument.create();

                for (const file of files) {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await PDFDocument.load(arrayBuffer);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }

                const pdfBytes = await mergedPdf.save();
                return { data: pdfBytes, name: 'merged.pdf', type: 'application/pdf' };
            }
        },
        'split-pdf': {
            title: 'Split PDF',
            desc: 'Separate one page or a whole set for easy conversion into independent PDF files.',
            icon: 'call_split',
            multiple: false,
            accept: '.pdf',
            optionsUi: () => `
                <label>Page Ranges (e.g. 1-3, 5): <input type="text" id="split-range" placeholder="e.g. 1-3, 5" style="width:100%; padding: 8px; margin-top: 5px; border:1px solid #ddd; border-radius:4px;"></label>
                <small style="color:#777; display:block; margin-top:4px;">Leave empty to extract all pages as separate files (Not supported in single demo, defaults to 1).</small>
            `,
            process: async (files) => {
                const { PDFDocument } = PDFLib;
                const file = files[0];
                const arrayBuffer = await file.arrayBuffer();
                const pdfDoc = await PDFDocument.load(arrayBuffer);
                const newPdf = await PDFDocument.create();
                const totalPages = pdfDoc.getPageCount();

                const rangeInput = document.getElementById('split-range').value.trim();
                let pagesToCopy = [];

                if (!rangeInput) {
                    pagesToCopy = Array.from({ length: totalPages }, (_, i) => i);
                } else {
                    const parts = rangeInput.split(',').map(p => p.trim());
                    const indices = new Set();

                    parts.forEach(part => {
                        if (part.includes('-')) {
                            const [start, end] = part.split('-').map(n => parseInt(n));
                            if (!isNaN(start) && !isNaN(end)) {
                                for (let i = start; i <= end; i++) indices.add(i - 1);
                            }
                        } else {
                            const page = parseInt(part);
                            if (!isNaN(page)) indices.add(page - 1);
                        }
                    });

                    pagesToCopy = Array.from(indices).filter(p => p >= 0 && p < totalPages).sort((a, b) => a - b);
                }

                const copiedPages = await newPdf.copyPages(pdfDoc, pagesToCopy);
                copiedPages.forEach(p => newPdf.addPage(p));

                const pdfBytes = await newPdf.save();
                return { data: pdfBytes, name: 'split.pdf', type: 'application/pdf' };
            }
        },
        'compress-pdf': {
            title: 'Compress PDF',
            desc: 'Reduce file size while optimizing for maximal PDF quality (Rasterizes content).',
            icon: 'compress',
            multiple: false,
            accept: '.pdf',
            optionsUi: () => `
                <label>Compression Level (0.1 - 1.0): <input type="range" id="compress-quality" min="0.1" max="1.0" step="0.1" value="0.5" oninput="this.nextElementSibling.value = this.value"></label>
                <output>0.5</output>
            `,
            process: async (files) => {
                const file = files[0];
                const arrayBuffer = await file.arrayBuffer();
                const pdfDocSource = await pdfjsLib.getDocument(arrayBuffer).promise;
                const { PDFDocument } = PDFLib;
                const newPdf = await PDFDocument.create();
                const quality = parseFloat(document.getElementById('compress-quality').value);

                for (let i = 1; i <= pdfDocSource.numPages; i++) {
                    const page = await pdfDocSource.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    const imgData = canvas.toDataURL('image/jpeg', quality);
                    const img = await newPdf.embedJpg(imgData);

                    const newPage = newPdf.addPage([viewport.width, viewport.height]);
                    newPage.drawImage(img, {
                        x: 0,
                        y: 0,
                        width: viewport.width,
                        height: viewport.height,
                    });
                }

                const pdfBytes = await newPdf.save();
                return { data: pdfBytes, name: 'compressed.pdf', type: 'application/pdf' };
            }
        },
        'pdf-to-word': {
            title: 'PDF to Word (Text)',
            desc: 'Extract text from PDF to editable Text file (Layout not preserved).',
            icon: 'description',
            multiple: false,
            accept: '.pdf',
            process: async (files) => {
                const file = files[0];
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                let fullText = "";

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const pageText = textContent.items.map(item => item.str).join(' ');
                    fullText += `--- Page ${i} ---\n\n${pageText}\n\n`;
                }

                return { data: fullText, name: 'converted.txt', type: 'text/plain' };
            }
        },
        'pdf-to-pptx': {
            title: 'PDF to Powerpoint',
            desc: 'Turn your PDF files into an editable PPTX slideshow (Images).',
            icon: 'slideshow',
            multiple: false,
            accept: '.pdf',
            process: async (files) => {
                const file = files[0];
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

                const pptx = new PptxGenJS();

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    const imgData = canvas.toDataURL('image/png');

                    const slide = pptx.addSlide();
                    slide.addImage({ data: imgData, x: 0, y: 0, w: '100%', h: '100%' });
                }

                const blob = await pptx.write('blob');
                return { data: blob, name: 'presentation.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
            }
        },
        'word-to-pdf': {
            title: 'Word to PDF',
            desc: 'Make DOC and DOCX files easy to read by converting them to PDF.',
            icon: 'picture_as_pdf',
            multiple: false,
            accept: '.docx,.doc',
            process: async (files) => {
                const file = files[0];
                const arrayBuffer = await file.arrayBuffer();
                const { value: html } = await mammoth.convertToHtml({ arrayBuffer });

                const element = document.createElement('div');
                element.innerHTML = `
                    <style>body { font-family: sans-serif; padding: 20px; }</style>
                    ${html}
                 `;

                const worker = html2pdf().from(element).toPdf().get('pdf');
                const pdfDoc = await worker.then(pdf => pdf.output('arraybuffer'));

                return { data: pdfDoc, name: 'converted.pdf', type: 'application/pdf' };
            }
        },
        'edit-pdf': {
            title: 'Edit PDF',
            desc: 'Add text, shapes, comments and highlights to your PDF file.',
            icon: 'edit',
            multiple: false,
            accept: '.pdf',
            process: async (files) => {
                alert("The full 'Edit PDF' with Fabric.js canvas involves a complex UI state not fully implemented in this single-file demo. Please try 'Watermark' or 'Sign' for specific editing features.");
                return null;
            }
        },
        'sign-pdf': {
            title: 'Sign PDF',
            desc: 'Sign yourself or request electronic signatures from others.',
            icon: 'draw',
            multiple: false,
            accept: '.pdf',
            optionsUi: () => `
                <div style="border:1px solid #ddd; background:#fff;">
                    <canvas id="signature-pad" width="400" height="200"></canvas>
                </div>
                <button onclick="document.getElementById('clear-sig').click()" class="btn btn-secondary" style="margin-top:5px; font-size:0.8rem;">Clear Signature</button>
                <button id="clear-sig" class="hidden"></button>
                <script>
                    (function(){
                        window.sigCanvas = new fabric.Canvas('signature-pad', { isDrawingMode: true });
                        window.sigCanvas.freeDrawingBrush.width = 3;
                        window.sigCanvas.freeDrawingBrush.color = 'black';
                        document.getElementById('clear-sig').onclick = () => window.sigCanvas.clear();
                    })();
                <\/script>
            `,
            process: async (files) => {
                if (!window.sigCanvas || window.sigCanvas.isEmpty()) {
                    alert('Please draw a signature first.');
                    return null;
                }
                const sigData = window.sigCanvas.toDataURL({ format: 'png' });

                const { PDFDocument } = PDFLib;
                const file = files[0];
                const pdfDoc = await PDFDocument.load(await file.arrayBuffer());
                const sigImage = await pdfDoc.embedPng(sigData);

                const pages = pdfDoc.getPages();
                const firstPage = pages[0];
                const { width, height } = firstPage.getSize();

                firstPage.drawImage(sigImage, {
                    x: 50,
                    y: 50,
                    width: 200,
                    height: 100,
                });

                const pdfBytes = await pdfDoc.save();
                return { data: pdfBytes, name: 'signed.pdf', type: 'application/pdf' };
            }
        },
        'watermark-pdf': {
            title: 'Watermark PDF',
            desc: 'Stamp an image or text over your PDF in seconds.',
            icon: 'branding_watermark',
            multiple: false,
            accept: '.pdf',
            optionsUi: () => `
                <label>Watermark Text: <input type="text" id="wm-text" value="CONFIDENTIAL" style="width:100%; padding:8px; margin-bottom:10px;"></label>
                <label>Opacity (0.1 - 1.0): <input type="number" id="wm-opacity" step="0.1" value="0.3" max="1" min="0.1" style="width:60px;"></label>
                <label>Color (Hex): <input type="color" id="wm-color" value="#FF0000"></label>
            `,
            process: async (files) => {
                const { PDFDocument, rgb, degrees } = PDFLib;
                const text = document.getElementById('wm-text').value;
                const opacity = parseFloat(document.getElementById('wm-opacity').value);
                const colorHex = document.getElementById('wm-color').value;

                const r = parseInt(colorHex.slice(1, 3), 16) / 255;
                const g = parseInt(colorHex.slice(3, 5), 16) / 255;
                const b = parseInt(colorHex.slice(5, 7), 16) / 255;

                const pdfDoc = await PDFDocument.load(await files[0].arrayBuffer());
                const pages = pdfDoc.getPages();

                pages.forEach(page => {
                    const { width, height } = page.getSize();
                    page.drawText(text, {
                        x: 50,
                        y: height / 2,
                        size: 50,
                        color: rgb(r, g, b),
                        opacity: opacity,
                        rotate: degrees(45),
                    });
                });

                const pdfBytes = await pdfDoc.save();
                return { data: pdfBytes, name: 'watermarked.pdf', type: 'application/pdf' };
            }
        },
        'rotate-pdf': {
            title: 'Rotate PDF',
            desc: 'Rotate your PDF pages.',
            icon: 'rotate_right',
            multiple: false,
            accept: '.pdf',
            optionsUi: () => `
                <label>Rotation:
                    <select id="rotate-deg" style="padding:5px;">
                        <option value="90">90 Degrees CW</option>
                        <option value="180">180 Degrees</option>
                        <option value="270">270 Degrees CW</option>
                    </select>
                </label>
            `,
            process: async (files) => {
                const { PDFDocument, degrees } = PDFLib;
                const deg = parseInt(document.getElementById('rotate-deg').value);

                const pdfDoc = await PDFDocument.load(await files[0].arrayBuffer());
                const pages = pdfDoc.getPages();
                pages.forEach(page => {
                    page.setRotation(degrees(page.getRotation().angle + deg));
                });

                const pdfBytes = await pdfDoc.save();
                return { data: pdfBytes, name: 'rotated.pdf', type: 'application/pdf' };
            }
        },
        'jpg-to-pdf': {
            title: 'JPG to PDF',
            desc: 'Convert JPG images into a single PDF document.',
            icon: 'picture_as_pdf',
            accept: 'image/jpeg',
            multiple: true,
            process: async (files) => {
                const { PDFDocument } = PDFLib;
                const newPdf = await PDFDocument.create();

                for (const file of files) {
                    const imgBytes = await file.arrayBuffer();
                    const img = await newPdf.embedJpg(imgBytes);
                    const page = newPdf.addPage([img.width, img.height]);
                    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                }

                const pdfBytes = await newPdf.save();
                return { data: pdfBytes, name: 'images.pdf', type: 'application/pdf' };
            }
        },
        'png-to-pdf': {
            title: 'PNG to PDF',
            desc: 'Convert PNG images into a single PDF document.',
            icon: 'picture_as_pdf',
            accept: 'image/png',
            multiple: true,
            process: async (files) => {
                const { PDFDocument } = PDFLib;
                const newPdf = await PDFDocument.create();

                for (const file of files) {
                    const imgBytes = await file.arrayBuffer();
                    const img = await newPdf.embedPng(imgBytes);
                    // Set page size to image size
                    const page = newPdf.addPage([img.width, img.height]);
                    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                }

                const pdfBytes = await newPdf.save();
                return { data: pdfBytes, name: 'images.pdf', type: 'application/pdf' };
            }
        },
        'pdf-to-png': {
            title: 'PDF to PNG',
            desc: 'Convert each page of a PDF into a PNG image.',
            icon: 'image',
            multiple: false,
            accept: '.pdf',
            process: async (files) => {
                const file = files[0];
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                const zip = new JSZip();

                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 2.0 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;

                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    zip.file(`page-${i}.png`, blob);
                }

                const content = await zip.generateAsync({ type: "blob" });
                return { data: content, name: 'converted_images.zip', type: 'application/zip' };
            }
        }
    };

    // Add placeholders for other tools to reach 27
    const placeholderTools = [
        { id: 'epub-to-pdf', title: 'EPUB to PDF', icon: 'book', desc: 'Convert EPUB ebooks to PDF.' },
        { id: 'pdf-to-pdfa', title: 'PDF to PDF/A', icon: 'archive', desc: 'Convert PDF to ISO-compliant PDF/A.' },
        { id: 'repair-pdf', title: 'Repair PDF', icon: 'build', desc: 'Recover data from a corrupted PDF.' },
        { id: 'page-numbers', title: 'Page Numbers', icon: 'format_list_numbered', desc: 'Add page numbers to PDFs.' },
        { id: 'scan-pdf', title: 'Scan to PDF', icon: 'scanner', desc: 'Capture document from scanner.' },
        { id: 'unlock-pdf', title: 'Unlock PDF', icon: 'lock_open', desc: 'Remove password from PDF.' },
        { id: 'protect-pdf', title: 'Protect PDF', icon: 'lock', desc: 'Encrypt your PDF with a password.' },
        { id: 'organize-pdf', title: 'Organize PDF', icon: 'format_align_left', desc: 'Sort, add and delete PDF pages.' },
        { id: 'excel-to-pdf', title: 'Excel to PDF', icon: 'table_chart', desc: 'Convert simple Excel spreadsheets to PDF.' },
        { id: 'pdf-to-excel', title: 'PDF to Excel', icon: 'grid_on', desc: 'Pull data straight from PDFs into Excel.' },
        { id: 'html-to-pdf', title: 'HTML to PDF', icon: 'code', desc: 'Convert webpages to PDF.' },
        { id: 'compare-pdf', title: 'Compare PDF', icon: 'compare_arrows', desc: 'Show differences between two PDFs.' },
        { id: 'ocr-pdf', title: 'OCR PDF', icon: 'text_fields', desc: 'Recognize text in scanned PDFs.' }
    ];

    placeholderTools.forEach(t => {
        tools[t.id] = {
            title: t.title,
            desc: t.desc,
            icon: t.icon,
            accept: '.pdf',
            multiple: true,
            process: async () => { alert('This tool is coming soon!'); return null; }
        };
    });

    // --- Initialization ---
    function init() {
        renderTools();
        setupEventListeners();
        setupIntersectionObserver();
    }

    function renderTools() {
        toolsGrid.innerHTML = '';
        Object.keys(tools).forEach(key => {
            const tool = tools[key];
            const card = document.createElement('div');
            card.className = 'tool-card fade-in';
            card.innerHTML = `
                <div class="tool-icon"><span class="material-icons-round">${tool.icon}</span></div>
                <div class="tool-title">${tool.title}</div>
                <div class="tool-desc">${tool.desc}</div>
            `;
            card.addEventListener('click', () => openModal(key));
            toolsGrid.appendChild(card);
        });
    }

    // --- Modal Logic ---
    function openModal(toolId) {
        currentToolId = toolId;
        const tool = tools[toolId];
        modalTitle.textContent = tool.title;
        fileInput.accept = tool.accept || '*/*';
        fileInput.multiple = tool.multiple !== false; // Default true unless specified
        toolOptions.innerHTML = tool.optionsUi ? tool.optionsUi() : '';

        resetModalState();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        resetModalState();
    }

    function resetModalState() {
        currentFiles = [];
        renderFileList();
        processResult.innerHTML = '';
        processResult.classList.add('hidden');
        loader.classList.add('hidden');
        processBtn.disabled = true;
        dropZone.classList.remove('hidden');
    }

    function handleFilesSelection(files) {
        const tool = tools[currentToolId];
        if (!tool.multiple && (currentFiles.length + files.length > 1)) {
            alert('This tool only accepts a single file.');
            return;
        }

        // Add valid files
        Array.from(files).forEach(f => {
            // Basic Type Check (Optional extension check)
            currentFiles.push(f);
        });

        renderFileList();
        processBtn.disabled = currentFiles.length === 0;
    }

    function renderFileList() {
        fileList.innerHTML = '';
        currentFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.innerHTML = `
                <span>${file.name} <small>(${formatSize(file.size)})</small></span>
                <button style="background:none; border:none; color:red; cursor:pointer;" onclick="removeFile(${index})">
                    <span class="material-icons-round">delete</span>
                </button>
            `;
            fileList.appendChild(item);
        });
        // Expose removeFile globally for the onclick handler
        window.removeFile = (index) => {
            currentFiles.splice(index, 1);
            renderFileList();
            processBtn.disabled = currentFiles.length === 0;
        };
    }

    function formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // --- Event Listeners ---
    function setupEventListeners() {
        // Header Scroll
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) header.classList.add('scrolled');
            else header.classList.remove('scrolled');
        });

        // Mobile Menu
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            navToggle.querySelector('span').textContent = navMenu.classList.contains('active') ? 'close' : 'menu';
        });

        // File Upload
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => handleFilesSelection(e.target.files));

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            handleFilesSelection(e.dataTransfer.files);
        });

        // Modal
        modalClose.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Process
        processBtn.addEventListener('click', async () => {
            const tool = tools[currentToolId];
            if (!tool) return;

            // UI Updates
            processBtn.disabled = true;
            dropZone.classList.add('hidden');
            fileList.innerHTML = '';
            loader.classList.remove('hidden');

            try {
                const result = await tool.process(currentFiles);
                if (result) {
                    showDownload(result);
                } else {
                    // If null, maybe tool not implemented or handled internally
                    alert('Tool implementation pending or finished without output.');
                }
            } catch (err) {
                console.error(err);
                alert('An error occurred: ' + err.message);
            } finally {
                loader.classList.add('hidden');
            }
        });
    }

    function showDownload(result) {
        processResult.innerHTML = '';
        const blob = new Blob([result.data], { type: result.type });
        const url = URL.createObjectURL(blob);

        const btn = document.createElement('a');
        btn.href = url;
        btn.download = result.name;
        btn.className = 'btn btn-primary';
        btn.innerHTML = `<span class="material-icons-round" style="margin-right:8px;">download</span> Download File`;

        processResult.appendChild(btn);
        processResult.classList.remove('hidden');
    }

    function setupIntersectionObserver() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible'); // Add a class for scroll reveal if needed
                }
            });
        }, { threshold: 0.1 });
    }

    // Run
    init();
});
