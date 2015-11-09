angular.module('directives').directive('showHideTableHeader', [
	'$compile', '$', '_', 'modalService',
	function($compile, $, _, modalService) {
			
		'use strict';

		return {
			scope: {
				headings        : '=showHideTableHeader',
				table           : '=reportTable',
				reinit          : '=',
				sortFn          : '&',
				defaultSortProp : '=',
				defaultSortDir  : '=',
				ignoreShowHide  : '='
			},
			templateUrl: 'templateUrl',
			link: function(scope, element, attrs) {

				scope.activeSortProp = scope.defaultSortProp;
				scope.activeSortDir = scope.defaultSortDir || 'asc';

				var table = null;
				var initalized = false;

				scope.sort = function(heading) {
					if (heading.isSortable) {
						if (scope.activeSortProp == heading.propName)
							scope.activeSortDir = scope.activeSortDir == 'asc' ? 'desc' : 'asc';
						else {
							scope.activeSortProp = heading.propName;
							scope.activeSortDir = 'asc';
						}

						if (scope.sortFn) scope.sortFn({
							propName: scope.activeSortProp,
							sortDir: scope.activeSortDir
						});
					}
				};

				scope.expandAll = function() {
					if (scope.expandAllFn) scope.expandAllFn();
				};

				scope.collapseAll = function() {
					if (scope.collapseAllFn) scope.collapseAllFn();
				};

				scope.init = function() {
					table = $(element).closest('table');
					var index = 0;
					var tempTable = [];

					if(scope.headings) {
						initalized = true;
						_.forEach(scope.headings, function() {
							//take predefined values if they exist
							if (scope.table && (scope.table[index] === undefined || scope.table[index] === true)) tempTable[index] = true;
							else tempTable[index] = false;
							index++;
						});

						if(scope.table) scope.table = tempTable;
					}
				};

				scope.showHideTablesCols = function(value) {
					for (var prop in value) {
						var rows = table.find('tr');
						_(rows).forEach(function(row) {
							var columns = $(row).find('td');
							var index = -1;
							var column = null;							
							
							_.forEach(columns, function(col) {
								var span = $(col).attr('colspan') || 1;
								index += Number(span);						

								if (index == parseInt(prop) && !$(col).hasClass('ignoreHide'))
									column = $(col);
								
							});

							if (column === null) column = $(row).find('th').eq(parseInt(prop));

							if (value[prop]) column.removeClass('hide-table-item');
							else column.addClass('hide-table-item');	
						});
					}
				};

				scope.$watch(function() {
					return scope.reinit;
				}, function(newVal) {
					if (newVal){
						if(!initalized || !scope.table || scope.table.length === 0)
							scope.init();
						scope.showHideTablesCols(scope.table);
					}
				});

				scope.openShowHideModal = function() {
					if(!scope.ignoreShowHide) {
						var newScope = {
							tableValues   : scope.table,
							tableHeadings : scope.headings
						};
						modalService
							.openTopBarModal(actionViewTemplates.showHideColumns, newScope)
							.then(function(table) {
								if(table)
									scope.table = table;
									scope.showHideTablesCols(table);									
							});
					}
				};

				scope.init();
			}
		};
	}
]);