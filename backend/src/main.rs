use distudio_backend::db::seed::{clear_seed_data, seed_demo_data};
use distudio_backend::{init_app_state, parse_cli_args, start_server, CliAction};

#[tokio::main]
async fn main() {
	match parse_cli_args(std::env::args().skip(1)) {
		CliAction::Seed(config) => match init_app_state(&config) {
			Ok(state) => match seed_demo_data(&state) {
				Ok(r) => {
					println!(
						"[distudio-seed] sukses: {} sesi, {} frame, {} stiker, {} filter, {} AR, {} ukuran, {} antrean.",
						r.sessions, r.frames, r.stickers, r.filters, r.ar_assets, r.frame_sizes, r.queue_items
					);
				}
				Err(err) => {
					eprintln!("[distudio-seed] gagal: {err}");
					std::process::exit(1);
				}
			},
			Err(err) => {
				eprintln!("[distudio-seed] gagal inisialisasi DB: {err}");
				std::process::exit(1);
			}
		},
		CliAction::ClearSeed(config) => match init_app_state(&config) {
			Ok(state) => match clear_seed_data(&state) {
				Ok(r) => {
					println!(
						"[distudio-seed] dibersihkan: {} sesi, {} frame, {} stiker, {} filter, {} AR, {} ukuran, {} antrean.",
						r.sessions, r.frames, r.stickers, r.filters, r.ar_assets, r.frame_sizes, r.queue_items
					);
				}
				Err(err) => {
					eprintln!("[distudio-seed] gagal membersihkan seed: {err}");
					std::process::exit(1);
				}
			},
			Err(err) => {
				eprintln!("[distudio-seed] gagal inisialisasi DB: {err}");
				std::process::exit(1);
			}
		},
		CliAction::Serve(config) => {
			if let Err(err) = start_server(config).await {
				eprintln!("[distudio-backend] fatal error: {err}");
				std::process::exit(1);
			}
		}
	}
}
