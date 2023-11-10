'use strict';
'require baseclass';
'require network';
'require view';
'require poll';
'require request';
'require dom';
'require ui';
'require uci';
'require fs';
'require tools.overthebox.graph as otbgraph';
'require tools.overthebox.svg as otbsvg';
'require tools.overthebox.rpc as otbrpc';

return baseclass.extend({
    title: _('Realtime Traffic'),
    pollIsActive: false,
    datapoints: [],
    aggregates: [],

    load: function () {
        return Promise.all([
            uci.load('network')
        ]);
    },

    retrieveInterfaces: function (network) {
        const interfaces = uci.sections('network', 'interface');

        let devs = [];
        // Search for interfaces which use multipath
        for (const itf of interfaces) {
            if (!itf.multipath || itf.multipath === "off") {
                continue
            }

            devs.push(itf.device);
        }

        return devs;
    },

    createGraph: function (device, type) {
        // Introduce some responsiveness
        const view = document.querySelector('#view');

        // Remove . from vlan enable devices (eth0.3)
        const regexp = /\./g;
        const id = device.replace(regexp, '') + '_' + type
        const graph = otbgraph.newGraph(id, view.offsetWidth);
        graph.svg = otbsvg.createBackground(id);

        if (device === 'all') {
            let line = otbsvg.createPolyLineElem(
                id,
                'DimGray',
                0
            );
            // Override style
            line.setAttributeNS(null, 'style', 'stroke:DimGray;stroke-width:3;stroke-linecap="round";fill:;fill-opacity:0;');
            graph.svg.appendChild(line);
        } else {
            graph.svg.appendChild(
                otbsvg.createPolyLineElem(
                    id,
                    otbgraph.stringToColour(device),
                    0.6
                )
            );
        }

        // Plot height time interval lines
        // With a width of 498 and a step of 5 we are just looping once here
        const intv = graph.step * 60;
        for (let i = graph.width % intv; i < graph.width; i += intv) {
            // Create Text element
            // With a width of 498 and a step of 5 that's 1
            const label = Math.round((graph.width - i) / graph.step / 60) + 'm';

            // Append lines
            graph.svg.appendChild(otbsvg.createLineElem(i, 0, i, '100%'));
            graph.svg.appendChild(otbsvg.createTextElem(i + 5, 15, label));
        }

        return graph;
    },

    pollData: function () {
        poll.add(L.bind(function () {
            const rpcStats = otbrpc.realtimeStats(),
                tasks = [];

            for (const { name, sets, graphs } of this.datapoints) {
                tasks.push(L.resolveDefault(rpcStats('interface', name), []).then(
                    rpc => {
                        const deviceStats = rpc.map(st => [[st[0], st[1]], [st[0], st[3]]]);
                        otbgraph.updateSets(graphs, sets, deviceStats);

                        // Redraw
                        for (const [i, set] of sets.entries()) {
                            otbgraph.drawSimple(graphs[i], set);
                        }
                    }
                ));
            }

            Promise.all(tasks).then(
                // Compute aggregate
                () => {
                    for (const [index, graph] of this.aggregates.entries()) {
                        let names = [];
                        let lines = [];

                        for (const { name, sets, graphs } of this.datapoints) {
                            names.push(graph.id + '_' + name);
                            lines.push(sets[index].points.slice());
                        }

                        // Redraw
                        otbgraph.drawAggregate(graph, names, lines);
                    }
                }
            )
        }, this), this.aggregates[0].wscale.interval);
    },

    render: function (data) {
        // Check if this render is executed for the first time
        if (!this.pollIsActive) {
            const devices = this.retrieveInterfaces(data[0]),
                box = E('div'),
                tabs = [E('div'), E('div')];

            // Init aggregate graph
            this.aggregates = [
                this.createGraph('all', 'rx'),
                this.createGraph('all', 'tx')
            ];

            for (const [i, g] of this.aggregates.entries()) {
                tabs[i].appendChild(E('div', { 'data-tab': 'all', 'data-tab-title': 'all', }, [
                    E('div', { 'style': 'width:100%;height:300px;border:1px solid #000;background:#fff' }, [g.svg]),
                    E('div', { 'class': 'right' }, E('small', { 'id': g.wscale.id }, '-'))
                ]));
            }

            // Init device graph
            for (const device of devices) {
                const d = {
                    name: device,
                    sets: new Array(2),
                    graphs: [
                        this.createGraph(device, 'rx'),
                        this.createGraph(device, 'tx')
                    ]
                };

                for (const [i, g] of d.graphs.entries()) {
                    d.sets[i] = {
                        points: new Array(g.points).fill(0),
                        peak: 1,
                        avg: 0,
                        // JS date are in ms, but we use s
                        lastUpdate: (Math.floor(Date.now() / 1000) - 120)
                    };

                    // Append line to aggregate
                    this.aggregates[i].svg.appendChild(
                        otbsvg.createPolyLineElem(
                            this.aggregates[i].id + '_' + device,
                            otbgraph.stringToColour(device),
                            0.6
                        )
                    );

                    tabs[i].appendChild(E('div', { 'data-tab': device, 'data-tab-title': device }, [
                        E('div', { 'style': 'width:100%;height:300px;border:1px solid #000;background:#fff' }, [g.svg]),
                        E('div', { 'class': 'right' }, E('small', { 'id': g.wscale.id }, '-'))
                    ]));
                }

                this.datapoints.push(d)
            }

            let title = 'Download';
            for (const tab of tabs) {
                box.appendChild(E('h2', title));
                box.appendChild(tab);
                ui.tabs.initTabGroup(box.lastElementChild.childNodes);
                title = 'Upload';
            }

            this.pollIsActive = 1;
            this.pollData();

            return box;
        }
    }
});
