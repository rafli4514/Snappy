use std::net::{Ipv4Addr, UdpSocket};
use std::time::Duration;

use axum::Json;
use serde_json::{json, Value};
use tokio::process::Command;

pub async fn get_network_ip() -> Json<Value> {
	let mut ips = collect_interface_ipv4s().await;
	if ips.is_empty() {
		if let Some(primary) = probe_primary_ipv4() {
			ips.push(primary);
		}
	}

	let lan_ip = ips
		.iter()
		.find(|ip| ip.starts_with("192.168.") || ip.starts_with("10.") || is_rfc1918_172(ip))
		.or_else(|| ips.first())
		.cloned();

	Json(json!({
		"ip": lan_ip,
		"allIps": ips
	}))
}

async fn collect_interface_ipv4s() -> Vec<String> {
	if cfg!(target_os = "windows") {
		let ps = "[System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.OperationalStatus -eq 'Up' -and $_.NetworkInterfaceType -ne 'Loopback' } | ForEach-Object { $_.GetIPProperties().UnicastAddresses } | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' } | ForEach-Object { $_.Address.IPAddressToString }";
		let fut = Command::new("powershell")
			.args(["-NoProfile", "-Command", ps])
			.output();
		if let Ok(Ok(out)) = tokio::time::timeout(Duration::from_secs(3), fut).await {
			if out.status.success() {
				let list: Vec<String> = String::from_utf8_lossy(&out.stdout)
					.lines()
					.map(str::trim)
					.filter(|s| is_usable_lan_ipv4(s))
					.map(str::to_string)
					.collect();
				if !list.is_empty() {
					return list;
				}
			}
		}
	}

	Vec::new()
}

fn probe_primary_ipv4() -> Option<String> {
	let sock = UdpSocket::bind("0.0.0.0:0").ok()?;
	sock.connect("8.8.8.8:80").ok()?;
	let ip = sock.local_addr().ok()?.ip();
	let s = ip.to_string();
	if is_usable_lan_ipv4(&s) {
		Some(s)
	} else {
		None
	}
}

fn is_usable_lan_ipv4(raw: &str) -> bool {
	let Ok(addr) = raw.parse::<Ipv4Addr>() else {
		return false;
	};
	!addr.is_loopback() && !addr.is_link_local() && !addr.is_unspecified()
}

fn is_rfc1918_172(raw: &str) -> bool {
	let Ok(addr) = raw.parse::<Ipv4Addr>() else {
		return false;
	};
	let octets = addr.octets();
	octets[0] == 172 && (16..=31).contains(&octets[1])
}
