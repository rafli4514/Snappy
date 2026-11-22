pub mod migrations;
pub mod seed;

use std::fs;
use std::path::Path;

use rusqlite::Connection;

pub fn open_sqlite(cache_dir: &Path) -> rusqlite::Result<Connection> {
	if !cache_dir.exists() {
		let _ = fs::create_dir_all(cache_dir);
	}
	let db_path = cache_dir.join("distudio.db");
	let conn = Connection::open(db_path)?;
	conn.execute_batch(
		"
		PRAGMA journal_mode = WAL;
		PRAGMA synchronous = NORMAL;
		PRAGMA foreign_keys = ON;
		PRAGMA busy_timeout = 5000;
		",
	)?;
	migrations::init_schema(&conn)?;
	Ok(conn)
}
