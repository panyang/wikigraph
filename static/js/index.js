CODES = {}; // this object will be populated once the user inputs two pages
var response; // global variable for the graph db response
var queryImages = {}; // an object to pass information to the graph
var imageURLs = []; // an array so it will retain order

// tells typeahead how to handle the user input (e.g. the get request params)
var pageNames = new Bloodhound({
    datumTokenizer: function(d) {
        return Bloodhound.tokenizers.whitespace(d.value);
    },
    queryTokenizer: Bloodhound.tokenizers.whitespace,
    limit: 30,
    remote: {
        url: '/page-names?query=%QUERY',
        filter: function(pageNames) {
            // Map the remote source JSON array to a JavaScript array
            return $.map(pageNames.results, function(page) {
                return {
                    value: page.title,
                    code: page.code
                };
            });
        }
    }
});

pageNames.initialize(); // initialize the bloodhound

function clear_all() {
    CODES = {};
    $('input#start-node').val('');
    $('input#end-node').val('');
    $('.details').html('');
    $('svg').remove();
    queryImages = {};
}

function clear_partial() {
    $('.details').html('');
    $('svg').remove();
    queryImages = {};
}

function getThumbnail(pageObject, pageKey) {
    var page = pageObject[pageKey];
    var thumbnail, thWidth, thHeight;
    if ('thumbnail' in page) { // if wikipedia query returned a thumbnail
        thumbnail = page.thumbnail.source;
        thWidth = page.thumbnail.width;
        thHeight = page.thumbnail.height;
    } else { // else returns grumpycat
        thumbnail = '../static/images/cat.jpg';
        thWidth = 100;
        thHeight = 100;
    }
    var info = {'title': page.title,
             'thumbnail': thumbnail,
             'width': thWidth,
             'height': thHeight};
    return info;
}

function addImage(item, node) {
    queryImages[node] = {'url': item.thumbnail,
                         'title': item.title,
                         'height': item.height,
                         'width': item.width};
}

function makeHTMLSnippet(node, thumbnail, title) {
    html = '<div class="page" id="page'+node.toString()+'">'+
           '<div class="squareimg"><img src='+thumbnail+'></div>';
           // +'<div class="page-title">'+title+'</div></div>';
    return html;
}

function addQueryImages(data) {
    var pageObject = data.query.pages;
    var htmlSnippets = {};
    Object.keys(pageObject).forEach(function(pageKey) {
        item = getThumbnail(pageObject, pageKey);
        // if (item.title == CODES.node1.title) {node = 0;} else {node = 1;}
        // stupid solution due to mismatch between wikipedia and dbPedia
        if (item.title.slice(0,6) == CODES.node1.title.slice(0, 6)) {
            node = 0;
        } else {
            node = 1;
        }
        htmlSnippets[node] = makeHTMLSnippet(node, item.thumbnail, item.title);
        addImage(item, CODES['node'+(node+1)].code);
        imageURLs[node] = {'title': item.title,
                           'thumbnail': item.thumbnail};
    });
    return htmlSnippets;
}

function addPathImages(data) {
    var pageObject = data.query.pages;
    Object.keys(pageObject).forEach(function(pageKey) {
        item = getThumbnail(pageObject, pageKey);
        var node;
        response.path.forEach(function(pathNode) {
            if (pathNode.name == item.title) {
                node = pathNode.code;
            }
        });
        addImage(item, node);
    });
}

function makeQueryURL(numPages, pagesParams) {
    var queryURL = 'http://en.wikipedia.org/w/api.php' +
                   '?action=query&format=json&redirects&prop=pageimages&' +
                   'pithumbsize=100px&pilimit=' + numPages + '&titles=' +
                   pagesParams + '&callback=?';
    return queryURL;
}

function decodeInput(d, node) {
    CODES[node] = {'title': d.value, 'code': d.code.toString()};
}

function query() {
    clear_partial();
    var pagesParams = CODES.node1.title + '|' + CODES.node2.title;
    var queryURL = makeQueryURL(numPages=2, pagesParams);
    var path = $('.details');

    $.getJSON(
        queryURL, // get the start/end images from wikipedia API
        function(data) {
            var htmlSnippets = addQueryImages(data);
            Object.keys(htmlSnippets).forEach(function(node) {
                path.append(htmlSnippets[node]);
            });
            $('#page0').after('<div class="page arrow loading" id="arrow1"></div>');
        });

    $.get(
        '/query',
        {'node1': CODES.node1.code, 'node2': CODES.node2.code},
        function(data) {

            response = JSON.parse(data); // decode the JSON
            path.html('');
            console.log('RETURNED PATH:', response.path);
            var inner = response.path.slice(1, -1);

            if (0 < inner.length) { // if there are intermediary nodes

                var numPages = inner.length;
                var innerNodes = [];
                inner.forEach(function(node) {
                    innerNodes.push(node.name);
                });
                var pagesParams;
                if (numPages > 1) {
                    pagesParams = innerNodes.join('|');
                } else { pagesParams = innerNodes; }
                var queryURL = makeQueryURL(numPages, pagesParams);
                $.getJSON(
                    queryURL,
                    function(data) {
                        addPathImages(data); //updates queryImages with inner ndoes
                        // updates queryImages with index numbers for ordering
                        response.path.forEach(function(node) {
                            queryImages[node.code].id = response.path.indexOf(node);
                        });
                        console.log("QUERY IMAGES:", queryImages);
                        drawGraph(response.results); // graph the results

                    });
            } else {
                drawGraph(response.results);
            }
        });
}

$(document).ready(function(e) {
    clear_all();
});

$('input#random-query').click(function(e) {
    $.get('/random',
        function(data) {
            var n1 = data.results[0];
            var n2 = data.results[1];
            var title1 = n1.title.replace('_', ' ');
            var title2 = n2.title.replace('_', ' ');
            CODES.node1 = {'title': title1, 'code': n1.code.toString()};
            CODES.node2 = {'title': title2, 'code': n2.code.toString()};
            $('input#start-node').val(title1);
            $('input#end-node').val(title2);
            // console.log(title1, title2);
            query();
        });
});

// event handler for the query submission
$('input#submit-query').click(function(e) {
	query();
});

// sets up the typeahead on the two input fields
$('.scrollable-dropdown-menu .typeahead').typeahead(null, {
    name: 'pageNames',
    displayKey: 'value',
    source: pageNames.ttAdapter()
});

// records the values chosen for each field as a global var
$('#start-node').on('typeahead:selected typeahead:autocompleted', function (e, d) {
    decodeInput(d, 'node1');
});

$('#end-node').on('typeahead:selected typeahead:autocompleted', function (e, d) {
    decodeInput(d, 'node2');
});

$('input[type=text]').focus(function(){
    this.select();
});


