var svg = d3.select('svg'),
    width = +svg.attr("width"),
    height = +svg.attr("height");

var radius = 25,
    distance = 30
    stroke = 15;

defs = svg.append("defs");

function arrowFactory(defs, arrow_id) {
    defs.append("marker")
        .attr("id", arrow_id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 5)
        .attr("refY", 0)
        .attr("markerWidth", 4)
        .attr("markerHeight", 4)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("class", "arrowHead");
}

arrowFactory(defs, "arrow");
arrowFactory(defs, "inArrow");
arrowFactory(defs, "outArrow");
arrowFactory(defs, "bothArrow");

var paths = [
    'data/youtube-181214.json',
    'data/twitch-181214.json'
];

var promises = [];

paths.forEach(function(url) {
    promises.push(
        new Promise(function(resolve, reject) {
            d3.json(url)
                .then(function(res) {
                    resolve(res);
                })
                .catch(function(err) {
                    console.error(err);
                    reject(err);
                });
        })
    );
});

var youtubeGraph, twitchGraph, graph;

var pieChart = PieChart();
var lineChart = LineChart();

Promise.all(promises).then(function(values) {
    youtubeGraph = values[0];
    twitchGraph = values[1];
    init();

    // testing chart
    var user = '얍얍', key = 'viewer'
    pieChart.Update(twitchGraph.nodes, user)
    lineChart.Update(twitchGraph.statistics["weekly_summary"], user, key);
});



var influenceScale = ['normalized_view', 'normalize_follower', 'normalized_score'];

function makeMergedNodes(_youtubeNodes, _twitchNodes, alpha) {
    var nodeMappingTable = {};
    var nodes = [];
    _youtubeNodes.forEach((node, i) => {
        let _id = node.id;

        nodes.push({
            'id' : _id,
            'alias' : node.alias,
            'normalized_view' : alpha * node['normalized_average_view'],
            'normalized_follower' : alpha * node['normalized_subscriber_count'],
            'normalized_score' : alpha * node['normalized_pra_score']
        });

        if (!nodeMappingTable[_id]) nodeMappingTable[_id] = i;
    });

    _twitchNodes.forEach((node, i) => {
        let index = nodeMappingTable[node.id];
        let target_node = nodes[index];
        
        target_node['normalized_view'] += (1 - alpha) * node['average_viewer']['normalized_viewer'];
        target_node['normalized_follower'] += (1 - alpha) * node['normalized_followers'];
        target_node['normalized_score'] += (1 - alpha) * node['normalized_sra_score'];
    });
    return nodes;
}

function makeMergedLinks(_youtubeLinks, _twitchLinks, alpha, dropout) {
    var linkMappingTable = {};
    var links = [];
    _youtubeLinks.forEach((link, i) => {
        let source = link.source, target = link.target;
        let _id = source + target;
        links.push({
            'source': source,
            'target': target,
            'normalized_score': alpha * link['normalized_score']
        });

        if (!linkMappingTable[_id]) linkMappingTable[_id] = i;
    });

    _twitchLinks.forEach((link, i) => {
        let source = link.source, target = link.target;
        let _id = source + target;
        let index = linkMappingTable[_id];
        let target_link =  links[index];

        if (target_link){
            target_link['normalized_score'] += (1 - alpha) * link['normalized_score'];
            if (target_link['normalized_score'] < dropout) target_link['normalized_score'] = 0;
        }
        else {
            let score = (1 - alpha) * link['normalized_score']
            if (score < dropout) {
                score = 0
            }
            links.push({
                'source': source,
                'target': target,
                'normalized_score': score
            });
        }
    });
    return links.filter(d => d.normalized_score >= dropout);
}

function merge(alpha=0.5, dropout=0.1) {
    var _nodes = makeMergedNodes(youtubeGraph.nodes, twitchGraph.nodes, alpha);
    var _links = makeMergedLinks(youtubeGraph.links, twitchGraph.links, alpha, dropout);

    return { 
        'nodes': _nodes,
        'links': _links
    };
}

function makeForceSimulation(nodes) {
    var simulation = d3.forceSimulation()
    .nodes(nodes);

    simulation
        .force("charge_force", d3.forceManyBody().strength(-100))
        .force("center_force", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(function (d) {
            return radius * d.normalized_average_view + 0.5;
        }).iterations(2))
        .force("x", d3.forceX())
        .force("y", d3.forceY());

    return simulation;
}

function tickActions(node, link, label) {
    //update circle positions each tick of the simulation 
    node
        .attr("cx", function (d) {
            return d.x = Math.max(2, Math.min(width - 2, d.x));
        })
        .attr("cy", function (d) {
            return d.y = Math.max(2, Math.min(height - 2, d.y));
        });

    //update link positions 
    //simply tells one end of the line to follow one node around
    //and the other end of the line to follow the other node around
    link
        .attr("x1", function (d) {
            return d.source.x;
        })
        .attr("y1", function (d) {
            return d.source.y;
        })
        .attr("x2", function (d) {
            return d.target.x;
        })
        .attr("y2", function (d) {
            return d.target.y;
        });
    label
        .attr("x", function (d) {
            return d.x;
        })
        .attr("y", function (d) {
            return d.y;
        });
}

function createLinkForce(links) {
    //Create the link force 
    //We need the id accessor to use named sources and targets 
    return d3.forceLink(links)
        .id(function (d) {
            return d.id;
        })
        .distance(distance);
}

function init() {
    /*
    var kinds = ["averageView", "subscriberCount", "recent_average_view"]
    var kind_max = {}
    for (var i = 0; i < kinds.length; i++) {
        kind_max[kinds[i]] = d3.max(graph.nodes, function (d) {
            return d[kinds[i]];
        });
    };
    var kind_to_color = function (d) {
        return d3.rgb(
            225 * d.averageView / kind_max.averageView,
            225 * d.recent_average_view / kind_max.recent_average_view,
            200
        )
    };
    */
    // Create graph
    graph = merge();
    var main = svg.append("g").attr("id", "graph"),
        node = main.append("g").selectAll(".node_circle"),
        link = main.append("g").selectAll(".link"),
        label = main.append("g").selectAll(".node_label");

    // Add mouseup event to graph_view
    document.getElementById('graph_view').addEventListener("mouseup", mouseUp);

    // Make force simulation
    var simulation = makeForceSimulation(graph.nodes);
    // Add tick instructions: 
    simulation.on("tick", () => tickActions(node, link, label));
    var linkedByIndex = {};
    
    restart(0.8);
    d3.timeout(function() {
        restart(0.5);
      }, 2000);
    // Add event listeners.
    function restart(alpha=0.5, dropout=0.1, scale_index=0) {
        graph = merge(alpha, dropout);
        // Create circles, General update pattern
        node = node.data(graph.nodes, d => d.id);

        node.exit().transition()
            .attr("r", 0).remove();
        node.transition()
            .duration(1000)
            .attr("r", function (node) {
                return radius * node[influenceScale[scale_index]];
            });
        node = node.enter().append("circle")
                .attr("class", ".node_circle")
                .attr("r", function (node) {
                    return radius * node[influenceScale[scale_index]];
                })
                // .attr("fill", function (d) {
                //     return kind_to_color(d).toString();
                // })
                .on("mousedown", mouseDown(0))
                .call(drag(simulation))
                .merge(node);
        
        //draw lines for the links 
        link = link.data(graph.links, d => d.source + "-" + d.target);
        link.exit().transition()
            .attr("stroke-width", 0).remove();
        link.transition()
            .duration(1000)
            .attr("stroke-width", function(d) {
                return stroke * d.normalized_score;
            });
        link = link.enter().append("line")
            .attr("class", "link")
            .attr("marker-end", "url(#arrow)")
            .attr("stroke-width", function (d) {
                return stroke * d.normalized_score;
            })
            .merge(link);
        // label nodes with alias
        label = label.data(graph.nodes, d => d.id)
        label.exit().remove();

        label = label.enter().append("text")
                    .attr("class", "node_label")
                    .attr("dx", ".4em")
                    .attr("dy", ".4em")
                    .attr("font-family", "Verdana")
                    .attr("font-size", 10)
                    .style("fill", "#000000")
                    .text(function (d) {
                        return d.alias;
                    })
                    .merge(label);
        simulation.nodes(graph.nodes);
        // Create Link Forces
        simulation.force("links", createLinkForce(graph.links));
        simulation.alpha(1).restart();
        // build a dictionary of nodes that are linked
        linkedByIndex = {};
        graph.links.forEach(function (d) {
            linkedByIndex[d.source.index + "," + d.target.index] = 1;
        });
        
        // check the dictionary to see if nodes are linked
        function isConnected(a, b) {
            return linkedByIndex[a.index + "," + b.index] || linkedByIndex[b.index + "," + a.index] || a.index == b.index;
        }

        function outlinkExist(a, b) {
            return linkedByIndex[a.index + "," + b.index];
        }

        function mouseDown(opacity) {
            return function (d) {
                // check all other nodes to see if they're connected
                // to this one. if so, keep the opacity at 1, otherwise
                // fade
                label.style("opacity", function (o) {
                    thisOpacity = isConnected(d, o) ? 1 : 0.2;
                    return thisOpacity;
                });
                node.style("stroke-opacity", function (o) {
                    thisOpacity = isConnected(d, o) ? 1 : 0.2;
                    return thisOpacity;
                });
                node.style("fill-opacity", function (o) {
                    thisOpacity = isConnected(d, o) ? 1 : 0.2;
                    return thisOpacity;
                });
                // also style link accordingly
                link.style("stroke-opacity", function (o) {
                    return o.source === d || o.target === d ? .5 : opacity;
                });
                link.style("stroke", function (o) {
                    if (o.normalized_score < 0.1) {
                        return "#ddd";
                    }
                    // out-link
                    if (o.source === d) {
                        return outlinkExist(o.target, d) ? "#922" : "#292";
                    }
                    // in-link
                    if (o.target === d) {
                        return outlinkExist(d, o.source) ? "#922" : "#992";
                    }
                    return "#ddd";
                });
                link.style("fill", function (o) {
                    // out-link
                    if (o.source === d) {
                        return outlinkExist(o.target, d) ? "#922" : "#292";
                    }
                    // in-link
                    if (o.target === d) {
                        return outlinkExist(d, o.source) ? "#922" : "#992";
                    }
                    return "#ddd";
                });
                link.attr('marker-end', function (o) {
                    // out-link
                    if (o.source === d) {
                        return outlinkExist(o.target, d) ? 'url(#bothArrow)' : 'url(#outArrow)';
                    }
                    // in-link
                    if (o.target === d) {
                        return outlinkExist(d, o.source) ? 'url(#bothArrow)' : 'url(#inArrow)';
                    }
                    return 'url(#arrow)';
                });
            };
        }
    } 
    function mouseUp() {
        label.style("opacity", 1);
        node.style("stroke-opacity", 1);
        node.style("fill-opacity", 1);
        link.style("stroke-opacity", .2);
        link.style("stroke", "#ddd");
        link.attr('marker-end', 'url(#arrow)');
    }
}


drag = function (simulation) {

    function dragstarted(d) {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    function dragged(d) {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
    }

    function dragended(d) {
        if (!d3.event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
}