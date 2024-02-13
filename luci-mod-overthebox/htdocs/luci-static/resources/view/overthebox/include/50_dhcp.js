'use strict';
'require baseclass';
'require rpc';
'require uci';
'require network';
'require validation';
'require tools.overthebox.rpc as otbrpc';

// Copied from luci-mod-status view/status/include/40_dhcp.js

return baseclass.extend({
	title: _('DHCP Leases'),

	isMACStatic: {},
	isDUIDStatic: {},

	load: function () {
		const rpcDHCP = otbrpc.dhcpLeases();
		return Promise.all([
			rpcDHCP(),
			network.getHostHints(),
			L.resolveDefault(uci.load('dhcp'))
		]);
	},

	handleCreateStaticLease: function (lease, ev) {
		ev.currentTarget.classList.add('spinning');
		ev.currentTarget.disabled = true;
		ev.currentTarget.blur();

		var cfg = uci.add('dhcp', 'host');
		uci.set('dhcp', cfg, 'name', lease.hostname);
		uci.set('dhcp', cfg, 'ip', lease.ipaddr);
		uci.set('dhcp', cfg, 'mac', lease.macaddr.toUpperCase());

		return uci.save()
			.then(L.bind(L.ui.changes.init, L.ui.changes))
			.then(L.bind(L.ui.changes.displayChanges, L.ui.changes));
	},

	handleCreateStaticLease6: function (lease, ev) {
		ev.currentTarget.classList.add('spinning');
		ev.currentTarget.disabled = true;
		ev.currentTarget.blur();

		var cfg = uci.add('dhcp', 'host'),
			ip6arr = lease.ip6addrs[0] ? validation.parseIPv6(lease.ip6addrs[0]) : null;

		uci.set('dhcp', cfg, 'name', lease.hostname);
		uci.set('dhcp', cfg, 'duid', lease.duid.toUpperCase());
		uci.set('dhcp', cfg, 'mac', lease.macaddr);
		if (ip6arr)
			uci.set('dhcp', cfg, 'hostid', (ip6arr[6] * 0xFFFF + ip6arr[7]).toString(16));

		return uci.save()
			.then(L.bind(L.ui.changes.init, L.ui.changes))
			.then(L.bind(L.ui.changes.displayChanges, L.ui.changes));
	},

	renderLeases: function (data) {
		let box = E('div');

		var leases = Array.isArray(data[0].dhcp_leases) ? data[0].dhcp_leases : [],
			leases6 = Array.isArray(data[0].dhcp6_leases) ? data[0].dhcp6_leases : [],
			machints = data[1].getMACHints(false),
			hosts = uci.sections('dhcp', 'host'),
			isReadonlyView = !L.hasViewPermission();

		for (var i = 0; i < hosts.length; i++) {
			var host = hosts[i];

			if (host.mac) {
				var macs = L.toArray(host.mac);
				for (var j = 0; j < macs.length; j++) {
					var mac = macs[j].toUpperCase();
					this.isMACStatic[mac] = true;
				}
			}
			if (host.duid) {
				var duid = host.duid.toUpperCase();
				this.isDUIDStatic[duid] = true;
			}
		};

		var table = E('table', { 'class': 'table lases' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Host')),
				E('th', { 'class': 'th' }, _('IPv4 address')),
				E('th', { 'class': 'th' }, _('MAC address')),
				E('th', { 'class': 'th' }, _('Lease time remaining')),
				isReadonlyView ? E([]) : E('th', { 'class': 'th cbi-section-actions' }, _('Static Lease'))
			])
		]);

		cbi_update_table(table, leases.map(L.bind(function (lease) {
			var exp, rows;

			if (lease.expires === false)
				exp = E('em', _('unlimited'));
			else if (lease.expires <= 0)
				exp = E('em', _('expired'));
			else
				exp = '%t'.format(lease.expires);

			var hint = lease.macaddr ? machints.filter(function (h) { return h[0] == lease.macaddr })[0] : null,
				host = null;

			if (hint && lease.hostname && lease.hostname != hint[1])
				host = '%s (%s)'.format(lease.hostname, hint[1]);
			else if (lease.hostname)
				host = lease.hostname;

			rows = [
				host || '-',
				lease.ipaddr,
				lease.macaddr,
				exp
			];

			if (!isReadonlyView && lease.macaddr != null) {
				var mac = lease.macaddr.toUpperCase();
				rows.push(E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': L.bind(this.handleCreateStaticLease, this, lease),
					'disabled': this.isMACStatic[mac]
				}, [_('Set Static')]));
			}

			return rows;
		}, this)), E('em', _('There are no active leases')));

		var table6 = E('table', { 'class': 'table leases6' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('Host')),
				E('th', { 'class': 'th' }, _('IPv6 address')),
				E('th', { 'class': 'th' }, _('DUID')),
				E('th', { 'class': 'th' }, _('Lease time remaining')),
				isReadonlyView ? E([]) : E('th', { 'class': 'th cbi-section-actions' }, _('Static Lease'))
			])
		]);

		cbi_update_table(table6, leases6.map(L.bind(function (lease) {
			var exp, rows;

			if (lease.expires === false)
				exp = E('em', _('unlimited'));
			else if (lease.expires <= 0)
				exp = E('em', _('expired'));
			else
				exp = '%t'.format(lease.expires);

			var hint = lease.macaddr ? machints.filter(function (h) { return h[0] == lease.macaddr })[0] : null,
				host = null;

			if (hint && lease.hostname && lease.hostname != hint[1] && lease.ip6addr != hint[1])
				host = '%s (%s)'.format(lease.hostname, hint[1]);
			else if (lease.hostname)
				host = lease.hostname;
			else if (hint)
				host = hint[1];

			rows = [
				host || '-',
				lease.ip6addrs ? lease.ip6addrs.join(' ') : lease.ip6addr,
				lease.duid,
				exp
			];

			if (!isReadonlyView && lease.duid != null) {
				var duid = lease.duid.toUpperCase();
				rows.push(E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': L.bind(this.handleCreateStaticLease6, this, lease),
					'disabled': this.isDUIDStatic[duid]
				}, [_('Set Static')]));
			}

			return rows;
		}, this)), E('em', _('There are no active leases')));

		box.appendChild(E([
			E('h2', _('DHCPv4 Leases')),
			table,
			E('h2', _('DHCPv6 Leases')),
			table6
		]));
		return box;
	},

	render: function (data) {
		let wrap = E('div');

		if (L.hasSystemFeature('dnsmasq') || L.hasSystemFeature('odhcpd')) {
			wrap.appendChild(this.renderLeases(data));
		} else {
			wrap.appendChild(E('p', _('No dhcp server detected')));
		}

		return wrap;
	}
});
