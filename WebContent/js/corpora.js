// (Private) corpora management page.
//
// Show a list of public and private corpora;
// Allows user to create and delete private corpora 
// and add data to them.


// (we place publically accessible functions here)
var CORPORA = {};

// Per corpus, we store the document format (i.e. TEI, FoLiA, ...) here
var corpora = {};

// (avoid polluting the global namespace)
(function() {
	
	// Request the list of available corpora and
	// update the corpora page with it.
	function refreshCorporaList(functionToCallAfterwards) {

		// Updates the lists of corpora HTML.
		// Called with the response data of the AJAX request.
		function updateCorporaLists(data) {
			var publicCorpora = [];
			var privateCorpora = [];
			var indices = data.indices;
			for (var indexName in indices) {
				if (indices.hasOwnProperty(indexName)) {
					// Found an index. Determine how to display it.
					var index = corpora[indexName] = indices[indexName];
					index.name = indexName;
					index.documentFormat = index.documentFormat || "";

					// Can we search this index?
					// If not, we'll show the current index status after the name.
					var statusText = "";
					var canSearch = index.canSearch = true;
					if (index.status != "available") {
						statusText = " (" + index.status + ")";
						canSearch = false;
					}
					
					// What type of index is this, public or private?
					var isPrivateIndex = index.isPrivate = indexName.indexOf(":") >= 0;
					var addToList = isPrivateIndex ? privateCorpora : publicCorpora;
					
					// Show the add data / delete corpus icons?
					// (only for private corpora that are not being written to at the moment)
					var delIcon = "", addIcon = "";
					var isBusy = index.isBusy = index.status != 'available' && index.status != 'empty';
					dispName = index.displayName;
					if (isPrivateIndex && !isBusy) {
						delIcon = "<a class='icon' title='Delete \"" + dispName + "\" corpus' " +
							"href='#' onclick='return CORPORA.deleteIndex(corpora[\"" + indexName + "\"]);'>" +
							"<i class='fa fa-trash'></i></a>";
						addIcon = "<a class='icon' title='Add data to \"" + dispName + "\" corpus' " +
							"href='#' onclick='return CORPORA.showUploadForm(corpora[\"" + indexName + "\"]);'>" +
							"<i class='fa fa-plus-square'></i></a>";
					}
					var searchIcon = "<a class='icon disabled'><i class='fa fa-search'></i></a>";
					
					// The index title and search icon (both clickable iff the index can be searched)
					var indexTitle = dispName;
					if (canSearch) {
						searchIcon = "<a class='icon' title='Search \"" + dispName + "\" corpus' " +
						"href='./" + indexName + "/single'><i class='fa fa-search'></i></a>";
						indexTitle = "<a title='Search \"" + dispName + "\" corpus' href='./" + 
							indexName + "/single'>" + dispName + "</a>";
					}
					
					// Add HTML for this corpus to the appropriate list.
					addToList.push("<tr><td class='corpusName'>" + indexTitle + statusText + "</td><td>" + 
						searchIcon + addIcon + delIcon + "</td></tr>");
				}
			}
			
			// Put the HTML in the two lists.
			$("#corpora").html(publicCorpora.join(""));
			$("#corpora-private").html(privateCorpora.join(""));
			
			// Determine which headings and lists to show
			// (we only show the private list to people who are authorized to do something there,
			//  and we only show the public list if there are any public corpora on the server)
			var showPublic = publicCorpora.length > 0;
			var userLoggedIn = data.user.loggedIn;
			var showPrivate = userLoggedIn && (privateCorpora.length > 0 || data.user.canCreateIndex);
			$("#header-public").toggle(showPublic && showPrivate);
			$("#header-private,#corpora-private").toggle(showPrivate);
			$("#create-corpus").toggle(data.user.canCreateIndex);
		}
		
		// Perform the AJAX request to get the list of corpora.
		$("#waitDisplay").show();
		$.ajax(blsUrl, {
			"type": "GET",
			"accept": "application/json",
			"dataType": "json",
			"success": function (data) {
				$("#waitDisplay").hide();
				updateCorporaLists(data);
				if (functionToCallAfterwards) {
					functionToCallAfterwards();
				}
			},
			"error": function (jqXHR, textStatus, errorThrown) {
				$("#waitDisplay").hide();
				var data = jqXHR.responseXML;
				if (data && data.error) {
					alert("Error for request: " + data.error.message);
				} else {
			    	alert("Error for request: " + textStatus + "; " + errorThrown);
				}
			},
		});
	}

	// Get the currently logged-in user.
	// (DEBUG STUB)
	function getUserId() {
		return "jan";
	}

	// Show a success message.
	function showSuccess(msg) {
		$("#errorDiv").hide();
		$("#successMessage").html(msg);
		$("#successDiv").show();
	}

	// Show an error message.
	function showError(msg) {
		$("#successDiv").hide();
		$("#errorMessage").html(msg).show();
		$("#errorDiv").show();
	}

	// Prompt the user for information and
	// create an index in their private user area.
	function createIndex() {
		hideUploadForm();
		
		// Ask the desired index name
		var shortName = prompt("Corpus name (letters and digits only):");
		if (shortName == null || shortName.length == 0)
			return;
		var displayName = prompt("Display name (all characters allowed, max. 80 long):");
		if (displayName == null)
			return;
		
		var format = prompt("Format: ", "TEI");
		
		// Prefix the user name because it's a private index
		indexName = getUserId() + ":" + shortName;
		
		// Create the index.
		$("#waitDisplay").show();
		$.ajax(blsUrl, {
			"type": "POST",
			"accept": "application/json",
			"dataType": "json",
			"data": {
				"name": indexName,
				"display": displayName,
				"format": format
			},
			"success": function (data) {
				$("#waitDisplay").hide();
				refreshCorporaList();
				showSuccess("Corpus \"" + displayName + "\" created.");
			},
			"error": function (jqXHR, textStatus, errorThrown) {
				$("#waitDisplay").hide();
				var data = jqXHR.responseJSON;
				var msg;
				if (data && data.error)
					msg = data.error.message;
				else
					msg = textStatus + "; " + errorThrown;
				showError("Could not create corpus \"" + shortName + "\": " + msg);
			},
		});
	}

	// What corpus are we uploading data to?
	var uploadToCorpus = null;

	// Makes the upload form visible and sets the corpus we're uploading to
	CORPORA.showUploadForm = function (index) {
		$("#uploadForm").show();
		$("#uploadCorpusName").text(index.displayName);
		$("#uploadFormat").text(index.documentFormat + " ");
		uploadToCorpus = index;
		return false; // cancel link
	}

	// Delete an index from your private user area
	CORPORA.deleteIndex = function (index) {
		hideUploadForm();
		
		if (!confirm("You are about to delete \"" + index.displayName + "\"; this cannot be undone! Are you sure?"))
			return false;
		
		$("#waitDisplay").show();
		$.ajax(blsUrl + index.name, {
			"type": "DELETE",
			"accept": "application/json",
			"dataType": "json",
			"success": function (data) {
				$("#waitDisplay").hide();
				refreshCorporaList(function () {
					showSuccess("Corpus \"" + index.displayName + "\" deleted.");
				});
			},
			"error": function (jqXHR, textStatus, errorThrown) {
				$("#waitDisplay").hide();
				var data = jqXHR.responseJSON;
				var msg;
				if (data && data.error)
					msg = data.error.message;
				else
					msg = textStatus + "; " + errorThrown;
				showError("Could not delete corpus \"" + index.displayName + "\": " + msg);
			},
		});
		return false; // cancel link
	}

	// Hide the upload form and reset for the next upload.
	function hideUploadForm() {
		var uploadButton = document.getElementById('uploadSubmit');
		uploadButton.innerHTML = 'Upload';
		uploadButton.removeAttribute('disabled');
		$("#uploadForm").hide();
	}

	// Initialise file uploading functionality.
	function initFileUpload() {
		
		hideUploadForm();
		var form = document.getElementById('uploadForm');
		var fileSelect = document.getElementById('uploadFile');
		var uploadButton = document.getElementById('uploadSubmit');
		uploadButton.removeAttribute('disabled');
		form.onsubmit = function (event) {
			event.stopPropagation();
			event.preventDefault();

			// Update button text.
			uploadButton.innerHTML = 'Uploading...';
			uploadButton.disabled = 'disabled';
			
			// Open the connection.
			var url = blsUrl + uploadToCorpus.name + "/docs/";
			
		    // Upload the selected files
			$("#waitDisplay").show();
		    var data = new FormData();
		    $.each(fileSelect.files, function(i, file)
		    {
		        data.append('data', file, file.name);
		    });
		    $.ajax({
		        "url": url,
		        "type": "POST",
		        "data": data,
		        "cache": false,
		        "dataType": "json",
		        "processData": false, // Don't process the files
		        "contentType": false, // Set content type to false as jQuery will tell the server its a query string request
		        "success": function (data, textStatus, jqXHR) {
		        	// File(s) uploaded.
					$("#waitDisplay").hide();
					hideUploadForm();
					refreshCorporaList(function () {
						showSuccess("Data added to \"" + uploadToCorpus.displayName + "\".");
					});
		        },
		        "error": function (jqXHR, textStatus, errorThrown) {
					$("#waitDisplay").hide();
					hideUploadForm();
		        	var data = jqXHR.responseJSON;
					var msg;
					if (data && data.error)
						msg = data.error.message;
					else
						msg = textStatus + "; " + errorThrown;
					showError("Could not add data to \"" + uploadToCorpus.displayName + "\": " + msg);
		        }
		    });
		}
	}

	$(document).ready(function () {
		// Get the list of corpora.
		refreshCorporaList();
		
		// Wire up the AJAX uploading functionality.
		initFileUpload();
		
		// Wire up the "create corpus" button.
		$("#create-corpus").click(createIndex);
	});

})();
