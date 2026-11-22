pub mod db;
pub mod routes;
pub mod state;

use std::net::SocketAddr;
use std::path::PathBuf;

pub use state::{AppState, ServerConfig};

#[derive(Debug, Clone)]
pub enum CliAction {
	Serve(ServerConfig),
	Seed(ServerConfig),
	ClearSeed(ServerConfig),
}

pub fn parse_cli_args<I, S>(args: I) -> CliAction
where
	I: IntoIterator<Item = S>,
	S: AsRef<str>,
{
	let mut config = ServerConfig::default();
	let mut mode = 0u8; // 0 = serve, 1 = seed, 2 = clear-seed

	let mut iter = args.into_iter();
	while let Some(arg) = iter.next() {
		match arg.as_ref() {
			"--host" => {
				if let Some(v) = iter.next() {
					config.host = v.as_ref().to_string();
				}
			}
			"--port" => {
				if let Some(v) = iter.next() {
					if let Ok(p) = v.as_ref().parse::<u16>() {
						config.port = p;
					}
				}
			}
			"--cache-dir" => {
				if let Some(v) = iter.next() {
					config.cache_dir = PathBuf::from(v.as_ref());
				}
			}
			"--static-dir" => {
				if let Some(v) = iter.next() {
					config.static_dir = Some(PathBuf::from(v.as_ref()));
				}
			}
			"--seed" => {
				mode = 1;
			}
			"--clear-seed" => {
				mode = 2;
			}
			_ => {}
		}
	}

	match mode {
		1 => CliAction::Seed(config),
		2 => CliAction::ClearSeed(config),
		_ => CliAction::Serve(config),
	}
}

pub fn init_app_state(
	config: &ServerConfig,
) -> Result<AppState, Box<dyn std::error::Error + Send + Sync>> {
	let conn = db::open_sqlite(&config.cache_dir)?;
	let state = AppState::new(config, conn)?;
	db::migrations::migrate_legacy_cache(&state);
	Ok(state)
}

pub async fn start_server(
	config: ServerConfig,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
	let state = init_app_state(&config)?;
	let app = routes::build_router(state);

	let addr_str = format!("{}:{}", config.host, config.port);
	let listener = tokio::net::TcpListener::bind(&addr_str).await?;
	let local_addr: SocketAddr = listener.local_addr()?;
	println!("[distudio-backend] Rust Axum + SQLite aktif di http://{local_addr}");
	axum::serve(listener, app).await?;
	Ok(())
}
