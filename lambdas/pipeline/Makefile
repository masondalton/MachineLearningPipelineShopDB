build-PipelineLambda:
	# jobs must exist in lambdas/pipeline before sam build; run: cp -r ../../jobs .  from project root
	test -d jobs || (echo "Missing jobs/ - run 'cp -r jobs lambdas/pipeline/' from project root before sam build" && exit 1)
	mkdir -p "$(ARTIFACTS_DIR)" && pip install -r requirements.txt -t "$(ARTIFACTS_DIR)" --quiet
	cp -r handler.py jobs "$(ARTIFACTS_DIR)/"
	# Remove extra files to reduce package size
	rm -rf "$(ARTIFACTS_DIR)"/*.dist-info "$(ARTIFACTS_DIR)"/*.egg-info "$(ARTIFACTS_DIR)"/bin
