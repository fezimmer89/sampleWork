angular.module('example.controllers').controller('clientController', [
	'$scope', '$rootScope', '$document', '$http', 'dateToString', 'modalService', '$timeout', '$q', 'datePickerService', 'constantsService', 
	'Paging', 'promiseMonitor', 'hierarchyManagerService', 'hierarchyService', 'lastSaleDate',
	function($scope, $rootScope, $document, $http, dateToString, modalService, $timeout, $q, actionViewTemplates, csvService, _, datePickerService, 
		constantsService, paging, PromiseMonitor, hierarchyManagerService, hierarchyService, lastSaleDate) {

		'use strict';

		var hierarchyNodeKeys = hierarchyService.getLeafNodeEntityIds($rootScope.user.hierarchy.hierarchy.nodes, $scope.settings.hierarchyNodeId);

        function createNodeSummaryHeadings() {
            $scope.activeItem.nodeSummaryHeadings = [];
            for (var i = 1; i < $scope.distanceFromLeaf; i++) {
                $scope.activeItem.nodeSummaryHeadings.push({
                    name: '',
                    isHidable: false,
                    propClass: 'text-center',
                    isSortable: false
                });
            }

            _.forEach(standardHeadings, function(heading) {
                $scope.activeItem.nodeSummaryHeadings.push(heading);
            });
        }

		function init() {
			return {
				productIds          : $scope.settings.productIds.value,
				hierarchyNodeId     : $scope.settings.hierarchyNodeId,
				table               : [],
				detailTable         : [],
				summaryTable        : []
			};
		}

		$scope.$watch(function() {
			return $scope.activeItem;
		}, function(newVal) {			
			if (newVal != $scope.listReport) {

				if (!newVal.filter)
					$scope.activeItem.filter = init();

				finalRowKey          = null;
				$scope.summaryReinit = false;
				$scope.reinit        = false;

                $scope.distanceFromLeaf = hierarchyService.getDistanceFromLeaf($rootScope.user.hierarchy.nodes, $scope.activeItem.filter.hierarchyNodeId || $scope.settings.hierarchyNodeId);
			
				lastSaleDate.getlastSaleDate(hierarchyNodeKeys)
					.then(function(lastSaleDate) {
						if (!lastSaleDate){
							$scope.noDefaultDatesFlag = true;						
							$scope.renderComplete = true;
						}
						else {
							if ($scope.distanceFromLeaf > 1) {
			                    if (!newVal.nodeSummary) getNodeSummary(getHierarchy($scope.activeItem.filter.hierarchyNodeId));
			                    else {
			                        $scope.showNodeAggregates = true;
			                        $scope.showAggregates     = false;
			                    }
			                } else {
			                    if (!newVal.aggregates) queryReport(getHierarchy($scope.activeItem.filter.hierarchyNodeId));
			                    else {                                                            
			                        $scope.showNodeAggregates = false;
			                        $scope.showAggregates     = true;

			                        $timeout(function(){
			                        	$scope.reinit = true;
			                        });
			                    }
			                }
						}
					});
			}
		});

		$scope.openHierarchyView = function() {
			hierarchyManagerService
				.openHierarchyModal($scope.activeItem.filter.hierarchyNodeId)
				.then(function(nodeId) {
					$scope.activeItem.filter.hierarchyNodeId = nodeId;
				});
		};

		$scope.updateHierarchyNode = function() {
			$scope.activeItem.detailNodeId = null;
		};

		$scope.filtersUpdated = function(){
			$scope.renderComplete = false;
			$scope.noDefaultDatesFlag = false;

            $scope.distanceFromLeaf = hierarchyService.getDistanceFromLeaf($rootScope.user.hierarchy.nodes, $scope.activeItem.filter.hierarchyNodeId || $scope.settings.hierarchyNodeId);

			lastSaleDate.getlastSaleDate(hierarchyNodeKeys)
				.then(function(lastSaleDate) {
					if (!lastSaleDate){
						$scope.noDefaultDatesFlag = true;							
						$scope.renderComplete = true;
					}
					else
						if ($scope.distanceFromLeaf > 1)
			                getNodeSummary(getHierarchy($scope.activeItem.filter.hierarchyNodeId));
			            else
			                queryReport(getHierarchy($scope.activeItem.filter.hierarchyNodeId));
				});
        };

        var completed = [];

        $scope.summaryReinitComplete = function(key) {
        	completed.push(key);

        	if(completed.length == ($scope.distanceFromLeaf - 1)){
        		completed = [];
        		$timeout(function(){
        			$scope.summaryReinit = true;
        		});
        	}
        };

        function drillIntoDetails(nodeId) {
            $scope.activeItem.detailNodeId = nodeId;            
            $scope.activeItem.detailNodeName = _.find($rootScope.user.hierarchy.nodes, function(node){ return node.id == nodeId; }).name;
            queryReport(getHierarchy($scope.activeItem.detailNodeId));
        }

        function nodeSummaryRequest(hierarchy){
        	return $http({
                url: ('api/.../nodeSummary').format($rootScope.user.subscriberId),
                method: 'GET',
                params: {
					hierarchy       : hierarchy,
					productIds      : $scope.activeItem.filter.productIds,
					startDate       : $scope.activeItem.dates.periodStartDate.format(),
					endDate         : $scope.activeItem.dates.lastSaleDate.format(),
					hierarchyNodeId : $scope.activeItem.filter.hierarchyNodeId
                }
            });
        }

        function getNodeSummary(hierarchyNodes) {
            $scope.summaryReinit      = false;
            $scope.showNodeAggregates = true;
            $scope.showAggregates     = false;           
            $scope.noDefaultDatesFlag = false;

            delete $scope.activeItem.nodeSummary;

            createNodeSummaryHeadings($scope.distanceFromLeaf);

            $scope.promiseMonitor.monitor(
            	nodeSummaryRequest(hierarchyNodes)
	                .then(function(summary) {
	                    $scope.activeItem.nodeSummary = summary.data;

	                    if(!$scope.activeItem.nodeSummary || Object.keys($scope.activeItem.nodeSummary.nodes).length === 0)
	                        $scope.noDefaultDatesFlag = true;
	                }));
        }

		function queryReport(hierarchy) {
			$scope.showNodeAggregates = false;
			$scope.showAggregates     = true;
			$scope.reinit             = false;

			delete $scope.activeItem.aggregates;

			var params = {
				hierarchy  : hierarchy,
				productIds : $scope.activeItem.filter.productIds,
				startDate  : $scope.activeItem.dates.periodStartDate.format(),
				endDate    : $scope.activeItem.dates.lastSaleDate.format()
			};

			$scope.promiseMonitor.monitor(
				$http({
	                url    : ('api/.../aggregates').format($rootScope.user.subscriberId),
	                method : 'GET',
	                params : params
	            })					
				.then(function(results) {
					$scope.activeItem.aggregates = results.data;

					if(!$scope.activeItem.aggregates || Object.keys($scope.activeItem.aggregates.hierarchy).length === 0)
	                        $scope.noDefaultDatesFlag = true;
				}));
		}

		$scope.getDetailRows = function(pageNumber, hiearchyNodes, product) {
			$scope.showAggregates     = false;
			$scope.showNodeAggregates = false;
			$scope.reinit             = false;

			if(hiearchyNodes) $scope.activeItem.hiearchyNodes = hiearchyNodes;
			if(product) $scope.activeItem.product               = product;

			delete $scope.activeItem.report;

			var params = {
				hierarchy  : hierarchyNodeKeys,
				productIds       : $scope.activeItem.filter.productIds,
				startDate        : $scope.activeItem.dates.periodStartDate.format(),
				endDate          : $scope.activeItem.dates.lastSaleDate.format(),
				sortProp         : $scope.activeItem.sorting.sortProp,
				sortDir          : $scope.activeItem.sorting.sortDir,
				hiearchyNodes   : $scope.activeItem.hiearchyNodes, 
				product          : $scope.activeItem.product,
			};

			$scope.promiseMonitor.monitor(
				$scope.activeItem.paging.getPage(('api/.../list').format($rootScope.user.subscriberId), pageNumber, params)
					.then(function(sales){
						$scope.activeItem.report = sales.items;
					}));
		};

		$scope.aggRowAction = function(key, depth, isExpanded) {
            if (depth <= 2)
                drillIntoDetails(key);
            else
                updateExpandedRows(key, isExpanded);
        };

        var nodes = null;

        function updateExpandedRows(key, isExpanded) {
            if (!nodes) nodes = hierarchyService.convertDataForEaseOfUse($rootScope.user.hierarchy.nodes);

            var node = _.find(nodes, function(node){
                    return node.id.toString() == key;
                });

            $scope.activeItem.aggregatesCollapse[key].isExpanded = isExpanded;

            if(!isExpanded){
                _.forEach(hierarchyService.getDescendants(nodes, node), function(node) {
                        if($scope.activeItem.aggregatesCollapse[node.id])
                            $scope.activeItem.aggregatesCollapse[node.id].isExpanded = isExpanded;
                    });
            }
        }

		$scope.sort = function(propName) {
			if (propName != $scope.activeItem.sorting.sortProp)
				$scope.activeItem.sorting.sortDir = 'asc';
			else
				$scope.activeItem.sorting.sortDir = $scope.activeItem.sorting.sortDir == 'asc' ? 'desc' : 'asc';

			$scope.activeItem.sorting.sortProp = propName;
			$scope.getDetailRows($scope.activeItem.paging.currentPage);
		};

		$scope.activeItem.groupCollapse = {};

		$scope.expandAll = function(isExpanded){
			_.forEach($scope.activeItem.groupCollapse, function(group){
				group.isExpanded = isExpanded;
			});
		};

		$scope.aggregatesExpandAll = function(isExpanded){
            _.forEach($scope.activeItem.aggregatesCollapse, function(group){
                group.isExpanded = isExpanded;
            });
        };

        $scope.action = function(){
            $scope.showAggregates = false;
            $scope.showNodeAggregates = true;
        };

		$scope.openDatePicker = function() {
			lastSaleDate.getLastSaleDate(hierarchyNodeKeys)
				.then(function(lastSaleDate) {
					return datePickerService.openDatePickerModal(
						$scope.activeItem.dates.periodStartDate,
						$scope.activeItem.dates.lastSaleDate,
						lastSaleDate);
				})
				.then(function(resultDates) {
					if (resultDates) {
						$scope.activeItem.dates.periodStartDate = resultDates[0];
						$scope.activeItem.dates.lastSaleDate = resultDates[1];
						
						if ($scope.distanceFromLeaf > 1)
			                getNodeSummary(getHierarchy($scope.activeItem.filter.hierarchyNodeId));
			            else
			                queryReport(getHierarchy($scope.activeItem.filter.hierarchyNodeId));
					}
				});
		};

		var lastNode = false;
		var lastProduct       = false;

		$scope.dcComplete = function() {
			lastNode = true;
		};

		$scope.prodComplete = function() {
			if(lastNode)
				lastProduct = true;
		};

		$scope.dtComplete = function() {
			if(lastProduct){
				lastNode    = false;
				lastProduct = false;		

				$timeout(function(){
					$scope.reinit = true;
				});	
			}
		};

        $scope.reinitComplete = function() {
            $scope.reinit = true;
        };  

		$scope.getHierarchyNodeDisplay = function(dcId) {
			return _($scope.nodes).find({
				entityId: parseInt(dcId)
			}).name;
		};

		var headingCenterClass = 'text-center clickable';

        $scope.aggregateHeadings = [{
				name: 'Hierarchy Node',
				isHidable: false,
				propClass: headingCenterClass,
				propName: 'hierarchyName',
				isSortable: true
			}, {
				name: 'Product',
				isHidable: false,
				propClass: headingCenterClass,
				propName: 'productName',
				isSortable: true
			}, {
				name: 'Sale Type',
				isHidable: false,
				propClass: headingCenterClass,
				propName: 'saleTypeName',
				isSortable: true
			}];

            $scope.tableHeadings = [{
				name: 'Sale Date',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'saleDate',
				isSortable: true
			},  {
				name: 'Account Number',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'accountNumber',
				isSortable: true
			}, {
				name: 'XXX Number',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'xxxNum',
				isSortable: true
			}, {
				name: 'XXX Size',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'xxxSize',
				isSortable: true
			}, {
				name: 'Units',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'units',
				isSortable: true
			}, {
				name: 'Ideal',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'ideal',
				isSortable: true
			}, {
				name: '% Ideal',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'percentage',
				isSortable: true
			}, {
				name: 'Adjusted %',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'adjPercent',
				isSortable: true
			}, {
				name: 'Variance',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'variance',
				isSortable: true
			}];

        var standardHeadings = [{
				name: 'Units',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'units',
				isSortable: true
			}, {
				name: '% Ideal',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'percentage',
				isSortable: true
			}, {
				name: 'Adjusted %',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'adjPercent',
				isSortable: true
			}, {
				name: 'Variance',
				isHidable: true,
				propClass: headingCenterClass,
				propName: 'variance',
				isSortable: true
			}];


        _.forEach(standardHeadings, function(heading) {
            $scope.aggregateHeadings.push(heading);
        });
	}
]);