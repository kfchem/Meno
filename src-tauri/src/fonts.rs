//! The system's fonts, for atom labels set in whatever typeface the user
//! picks: the names of the families installed, and one family's regular face
//! as a font file the canvas can read. Nothing is fetched; fonts are read
//! from where the system keeps them.

use fontdb::{Database, Family, Query, Stretch, Style, Weight};
use std::sync::OnceLock;

static SYSTEM: OnceLock<Database> = OnceLock::new();

/// The system's fonts, found once: looking through them all takes a moment.
fn system() -> &'static Database {
    SYSTEM.get_or_init(|| {
        let mut db = Database::new();
        db.load_system_fonts();
        db
    })
}

/// Every font family installed, by its first name (English, where it has
/// one), sorted without regard to case.
#[tauri::command]
pub async fn font_families() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(|| families(system()))
        .await
        .map_err(|e| e.to_string())
}

fn families(db: &Database) -> Vec<String> {
    let mut names: Vec<String> = db
        .faces()
        .filter_map(|face| face.families.first().map(|(name, _)| name.clone()))
        // the system's own hidden faces (".SF NS" and the like)
        .filter(|name| !name.starts_with('.'))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    names.dedup();
    names
}

/// The regular face of `family`, as a font file of its own.
#[tauri::command]
pub async fn font_file(family: String) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || regular_face(system(), &family))
        .await
        .map_err(|e| e.to_string())?
        .map(tauri::ipc::Response::new)
}

fn regular_face(db: &Database, family: &str) -> Result<Vec<u8>, String> {
    let id = db
        .query(&Query {
            families: &[Family::Name(family)],
            weight: Weight::NORMAL,
            stretch: Stretch::Normal,
            style: Style::Normal,
        })
        .ok_or_else(|| format!("there is no font named {family} on this system"))?;
    db.with_face_data(id, |data, index| single_face(data, index).map(with_plain_cmap))
        .flatten()
        .ok_or_else(|| format!("the font {family} could not be read"))
}

/// One face's tables as they stand in `data`: tag, checksum and contents.
type Tables<'a> = Vec<([u8; 4], [u8; 4], std::borrow::Cow<'a, [u8]>)>;

/// The header and tables of the face whose header starts at `face`.
fn tables_at(data: &[u8], face: usize) -> Option<([u8; 12], Tables<'_>)> {
    let u32_at = |at: usize| {
        data.get(at..at + 4)
            .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    };
    let header: [u8; 12] = data.get(face..face + 12)?.try_into().ok()?;
    let count = u16::from_be_bytes([header[4], header[5]]) as usize;
    let mut tables = Vec::with_capacity(count);
    for i in 0..count {
        let record = face + 12 + 16 * i;
        let tag = data.get(record..record + 4)?.try_into().ok()?;
        let checksum = data.get(record + 4..record + 8)?.try_into().ok()?;
        let offset = u32_at(record + 8)? as usize;
        let length = u32_at(record + 12)? as usize;
        let bytes = data.get(offset..offset.checked_add(length)?)?;
        tables.push((tag, checksum, bytes.into()));
    }
    Some((header, tables))
}

/// A font file of `header` and `tables`: the table records, then the
/// tables, each on a four-byte boundary.
fn write_font(header: [u8; 12], tables: &Tables<'_>) -> Vec<u8> {
    let start = 12 + 16 * tables.len();
    let mut records = Vec::with_capacity(16 * tables.len());
    let mut body = Vec::new();
    for (tag, checksum, bytes) in tables {
        records.extend_from_slice(tag);
        records.extend_from_slice(checksum);
        records.extend_from_slice(&((start + body.len()) as u32).to_be_bytes());
        records.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
        body.extend_from_slice(bytes);
        body.resize(body.len().next_multiple_of(4), 0);
    }
    let mut out = Vec::with_capacity(start + body.len());
    out.extend_from_slice(&header);
    out.extend_from_slice(&records);
    out.extend_from_slice(&body);
    out
}

/// A font file holding only face `index` of `data`: `data` as it is, unless
/// it is a collection (a .ttc, as many system and Japanese fonts are), whose
/// faces share tables where a reader of single fonts cannot find them.
pub fn single_face(data: &[u8], index: u32) -> Option<Vec<u8>> {
    if data.get(0..4)? != b"ttcf" {
        return Some(data.to_vec());
    }
    let u32_at = |at: usize| {
        data.get(at..at + 4)
            .map(|b| u32::from_be_bytes([b[0], b[1], b[2], b[3]]))
    };
    if index >= u32_at(8)? {
        return None;
    }
    let face = u32_at(12 + 4 * index as usize)? as usize;
    let (header, tables) = tables_at(data, face)?;
    Some(write_font(header, &tables))
}

/// `font` with its character map rewritten in the one form every reader of
/// fonts Meno uses can follow - a Unicode table in format 12, listed as both
/// Unicode (0, 4) and Windows (3, 10) - since fonts carry maps of many kinds
/// and each reader follows only some: one stops at Helvetica's older kinds,
/// another finds nothing it knows in Hiragino's. A font with no Unicode map
/// is left as it is.
pub fn with_plain_cmap(font: Vec<u8>) -> Vec<u8> {
    let Ok(face) = ttf_parser::Face::parse(&font, 0) else {
        return font;
    };
    let Some(cmap) = face.tables().cmap else {
        return font;
    };
    let mut map = std::collections::BTreeMap::new();
    for s in cmap.subtables.into_iter().filter(|s| s.is_unicode()) {
        s.codepoints(|cp| {
            if let Some(glyph) = s.glyph_index(cp) {
                map.entry(cp).or_insert(glyph.0 as u32);
            }
        });
    }
    if map.is_empty() {
        return font;
    }
    let table = cmap_format12(&map);
    let Some((header, mut tables)) = tables_at(&font, 0) else {
        return font;
    };
    for entry in tables.iter_mut().filter(|t| &t.0 == b"cmap") {
        entry.1 = [0; 4];
        entry.2 = table.clone().into();
    }
    write_font(header, &tables)
}

/// A character map of one Unicode table in format 12 - runs of consecutive
/// characters on consecutive glyphs - listed for Unicode (0, 4) and for
/// Windows (3, 10).
fn cmap_format12(map: &std::collections::BTreeMap<u32, u32>) -> Vec<u8> {
    // (first character, last character, glyph of the first)
    let mut groups: Vec<(u32, u32, u32)> = Vec::new();
    for (&cp, &glyph) in map {
        match groups.last_mut() {
            Some((start, end, first)) if cp == *end + 1 && glyph == *first + (cp - *start) => {
                *end = cp
            }
            _ => groups.push((cp, cp, glyph)),
        }
    }
    let mut t = Vec::new();
    t.extend_from_slice(&0u16.to_be_bytes()); // version
    t.extend_from_slice(&2u16.to_be_bytes()); // two listings of one table
    for (platform, encoding) in [(0u16, 4u16), (3, 10)] {
        t.extend_from_slice(&platform.to_be_bytes());
        t.extend_from_slice(&encoding.to_be_bytes());
        t.extend_from_slice(&20u32.to_be_bytes()); // after the listings
    }
    t.extend_from_slice(&12u16.to_be_bytes()); // format
    t.extend_from_slice(&0u16.to_be_bytes());
    t.extend_from_slice(&((16 + 12 * groups.len()) as u32).to_be_bytes());
    t.extend_from_slice(&0u32.to_be_bytes()); // language
    t.extend_from_slice(&(groups.len() as u32).to_be_bytes());
    for (start, end, glyph) in groups {
        t.extend_from_slice(&start.to_be_bytes());
        t.extend_from_slice(&end.to_be_bytes());
        t.extend_from_slice(&glyph.to_be_bytes());
    }
    t
}

#[cfg(test)]
mod tests {
    use super::{cmap_format12, single_face, with_plain_cmap};
    use std::collections::BTreeMap;

    #[test]
    fn writes_a_character_map_a_reader_follows_in_runs() {
        // A-C on glyphs 5-7 run on; E starts a run of its own; so does 化
        let map = BTreeMap::from([
            (0x41, 5),
            (0x42, 6),
            (0x43, 7),
            (0x45, 9),
            (0x5316, 1341),
        ]);
        let bytes = cmap_format12(&map);
        let table = ttf_parser::cmap::Table::parse(&bytes).unwrap();
        // listed for Unicode and for Windows, both Unicode tables
        assert_eq!(table.subtables.len(), 2);
        for sub in table.subtables {
            assert!(sub.is_unicode());
            for (&cp, &glyph) in &map {
                assert_eq!(sub.glyph_index(cp).map(|g| g.0 as u32), Some(glyph));
            }
            assert_eq!(sub.glyph_index(0x44), None);
        }
        // three runs of twelve bytes, after the listings (20) and the table's header (16)
        assert_eq!(bytes.len(), 20 + 16 + 3 * 12);
    }

    #[test]
    fn leaves_what_is_not_a_font_as_it_is() {
        let junk = b"not a font at all".to_vec();
        assert_eq!(with_plain_cmap(junk.clone()), junk);
    }

    /// A collection of two faces with one table each, "tabA" and "tabB".
    fn collection() -> Vec<u8> {
        let mut c = Vec::new();
        c.extend_from_slice(b"ttcf");
        c.extend_from_slice(&0x0001_0000u32.to_be_bytes());
        c.extend_from_slice(&2u32.to_be_bytes());
        // the two faces' headers start at 20 and 48
        c.extend_from_slice(&20u32.to_be_bytes());
        c.extend_from_slice(&48u32.to_be_bytes());
        for (tag, data_at) in [(b"tabA", 76u32), (b"tabB", 82u32)] {
            c.extend_from_slice(&0x0001_0000u32.to_be_bytes());
            c.extend_from_slice(&1u16.to_be_bytes());
            c.extend_from_slice(&[0; 6]);
            c.extend_from_slice(tag);
            c.extend_from_slice(&7u32.to_be_bytes());
            c.extend_from_slice(&data_at.to_be_bytes());
            c.extend_from_slice(&6u32.to_be_bytes());
        }
        c.extend_from_slice(b"AAAAAA");
        c.extend_from_slice(b"BBBBBB");
        c
    }

    #[test]
    fn takes_one_face_out_of_a_collection() {
        let face = single_face(&collection(), 1).unwrap();
        // an ordinary font's header, one table record, the table padded to four
        assert_eq!(&face[0..4], &0x0001_0000u32.to_be_bytes());
        assert_eq!(&face[4..6], &1u16.to_be_bytes());
        assert_eq!(&face[12..16], b"tabB");
        assert_eq!(&face[16..20], &7u32.to_be_bytes());
        assert_eq!(&face[20..24], &28u32.to_be_bytes());
        assert_eq!(&face[24..28], &6u32.to_be_bytes());
        assert_eq!(&face[28..34], b"BBBBBB");
        assert_eq!(face.len(), 36);
        assert_eq!(&single_face(&collection(), 0).unwrap()[28..34], b"AAAAAA");
    }

    #[test]
    fn leaves_a_single_font_as_it_is_and_refuses_a_face_not_there() {
        let font = b"\x00\x01\x00\x00rest of a font".to_vec();
        assert_eq!(single_face(&font, 0), Some(font));
        assert_eq!(single_face(&collection(), 2), None);
        assert_eq!(single_face(&collection()[..30], 1), None);
    }
}
