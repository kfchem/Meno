//! The PDF trial (docs/PDF.md, step 0): how fast PDFium opens a PDF, draws a
//! page at the column's width and in tiles, reads a page's text and searches.
//! `cargo run --release --example pdf_bench -- <libdir> <file.pdf>`
use pdfium_render::prelude::*;
use std::time::Instant;

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (libdir, file) = (&args[1], &args[2]);
    let t = Instant::now();
    let pdfium = Pdfium::new(Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(libdir)).expect("bind"));
    println!("bind: {:.1} ms", ms(t));

    let t = Instant::now();
    let doc = pdfium.load_pdf_from_file(file, None).expect("open");
    let pages = doc.pages();
    println!("open: {:.1} ms, {} pages", ms(t), pages.len());

    // the first page at a column's width (440 px at 2x), as a soft preview (220 px) and sharp
    for (label, width) in [("preview 220 px", 220), ("column 880 px", 880), ("column 1760 px (zoomed 2x)", 1760)] {
        let t = Instant::now();
        let page = pages.get(0).unwrap();
        let cfg = PdfRenderConfig::new().set_target_width(width).set_reverse_byte_order(true).render_form_data(false);
        let bm = page.render_with_config(&cfg).unwrap();
        let bytes = bm.as_raw_bytes();
        println!("page 1 {label}: {:.1} ms ({}x{}, {:.1} MB)", ms(t), bm.width(), bm.height(), bytes.len() as f64 / 1e6);
    }

    // 512 px tiles of page 2 (a figure) at 3x, and of the heavy last page
    for (name, index) in [("page 2", 1), ("heavy last page", pages.len() - 1)] {
        let page = pages.get(index).unwrap();
        let scale = 3.0f32;
        let (w, h) = ((page.width().value * scale) as i32, (page.height().value * scale) as i32);
        let mut times = vec![];
        let t_all = Instant::now();
        let mut y = 0;
        while y < h {
            let mut x = 0;
            while x < w {
                let t = Instant::now();
                let mut bm = PdfBitmap::empty(512, 512, PdfBitmapFormat::BGRA).unwrap();
                let cfg = PdfRenderConfig::new().scale_page_by_factor(scale).set_origin(-x, -y).set_reverse_byte_order(true).render_form_data(false);
                page.render_into_bitmap_with_config(&mut bm, &cfg).unwrap();
                let _ = bm.as_raw_bytes();
                times.push(ms(t));
                x += 512;
            }
            y += 512;
        }
        times.sort_by(|a, b| a.partial_cmp(b).unwrap());
        println!(
            "{name} at 3x ({w}x{h}): {} tiles in {:.0} ms; a tile: median {:.1} ms, slowest {:.1} ms",
            times.len(),
            ms(t_all),
            times[times.len() / 2],
            times[times.len() - 1]
        );
    }

    // a page's text, with where each letter is
    let t = Instant::now();
    let page = pages.get(1).unwrap();
    let text = page.text().unwrap();
    let mut n = 0;
    for c in text.chars().iter() {
        let _ = c.loose_bounds();
        n += 1;
    }
    println!("page 2 text: {n} letters with their boxes in {:.1} ms", ms(t));
    let all = text.all();
    let i = all.find("confor").unwrap_or(0);
    println!("around the broken word: {:?}", &all[i.saturating_sub(10)..(i + 40).min(all.len())]);

    // search: a word broken across a line by a hyphen, and one that is not
    for q in ["conformational", "confor-", "rotational barrier", "Boltzmann population"] {
        let t = Instant::now();
        let mut hits = 0;
        for p in pages.iter() {
            let tx = p.text().unwrap();
            let search = tx.search(q, &PdfSearchOptions::new()).unwrap();
            while search.find_next().is_some() {
                hits += 1;
            }
        }
        println!("search {q:?}: {hits} hits in {:.1} ms", ms(t));
    }
}
